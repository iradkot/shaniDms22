import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, View, Text} from 'react-native';
import {getApp} from '@react-native-firebase/app';
import {getAuth, signOut} from '@react-native-firebase/auth';
import {
  getMessaging,
  setAutoInitEnabled,
} from '@react-native-firebase/messaging';
import {useAppLanguage} from '../../../contexts/AppLanguageContext';
import {isE2E} from '../../../utils/e2e';
import {
  clearPrivacySession,
  registerPrivacySession,
  type PrivacyConsent,
} from '../../../modules/privacy';
import {PrivacyView} from '../../../product/privacy/PrivacyView';
import {PrivacyControlsContext} from '../../../product/privacy/PrivacyControlsContext';
import {nativePrivacyService} from './nativePrivacyService';
import GoogleSignIn from '../../../api/GoogleSignIn';

export const NativePrivacyBoundary = ({
  children,
}: {
  readonly children: React.ReactNode;
}) => {
  const {language} = useAppLanguage();
  const [uid, setUid] = useState<string | null>(() =>
    isE2E ? null : getAuth(getApp()).currentUser?.uid ?? null,
  );
  const observedUid = useRef(uid);
  const [authRevision, setAuthRevision] = useState(0);
  const [consent, setConsent] = useState<PrivacyConsent | null>(null);
  const [loading, setLoading] = useState(!isE2E && uid !== null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [recoveryOwner, setRecoveryOwner] = useState<string | null>(null);
  const [recoveryLoading, setRecoveryLoading] = useState(!isE2E);
  const [nativeRecoveryFailed, setNativeRecoveryFailed] = useState(false);
  const sequence = useRef(0);
  useEffect(() => {
    if (isE2E) {
      return;
    }
    setAutoInitEnabled(
      getMessaging(getApp()),
      !!uid && !!consent?.cloudSync && !deleting && !recoveryOwner,
    ).catch(() => undefined);
  }, [uid, consent, deleting, recoveryOwner]);
  useEffect(() => {
    if (isE2E) {
      clearPrivacySession();
      return;
    }
    nativePrivacyService
      .recoveryOwner()
      .then(async owner => {
        setRecoveryOwner(owner);
        if (owner) {
          try { await nativePrivacyService.resumeNativeDeletion(owner); }
          catch { setNativeRecoveryFailed(true); }
        }
      })
      .finally(() => setRecoveryLoading(false));
    return getAuth(getApp()).onAuthStateChanged(user => {
      const nextUid = user?.uid ?? null;
      // Firebase emits an initial callback even when currentUser was restored
      // before mount. That notification must not invalidate its only load.
      if (observedUid.current === nextUid) {
        return;
      }
      observedUid.current = nextUid;
      clearPrivacySession();
      sequence.current += 1;
      setConsent(null);
      setLoading(user !== null);
      setUid(nextUid);
      // A -> B -> A can be batched into one render with an unchanged UID.
      // The revision still starts a fresh consent load for the new session.
      setAuthRevision(value => value + 1);
      setDeleting(false);
      setOpen(false);
    });
  }, []);
  useEffect(() => {
    if (!uid || isE2E) {
      setLoading(false);
      return;
    }
    const current = ++sequence.current;
    setLoading(true);
    nativePrivacyService.load(uid).then(
      result => {
        if (sequence.current !== current) {
          return;
        }
        setConsent(result.consent);
        setDeleting(result.deleting);
        registerPrivacySession(uid, result.deleting ? null : result.consent);
        setLoading(false);
      },
      () => {
        if (sequence.current === current) {
          registerPrivacySession(uid, null);
          setLoading(false);
        }
      },
    );
    return () => {
      sequence.current += 1;
      clearPrivacySession();
    };
  }, [authRevision, uid]);
  const runtime = {
    consent,
    saveConsent: async (cloudSync: boolean, aiProcessing: boolean) => {
      if (!uid) {
        throw new Error('Sign in first.');
      }
      // Deny immediately while saving/withdrawing, and unmount all async owners.
      registerPrivacySession(uid, null);
      setConsent(null);
      setOpen(true);
      const capturedSequence = sequence.current;
      try {
        const next = await nativePrivacyService.save(
          uid,
          cloudSync,
          aiProcessing,
        );
        if (
          getAuth(getApp()).currentUser?.uid !== uid ||
          sequence.current !== capturedSequence
        ) {
          throw new Error('Account changed.');
        }
        registerPrivacySession(uid, next);
        setConsent(next);
        setOpen(false);
        setGeneration(value => value + 1);
      } finally {
        /* The Privacy view keeps errors and retries visible. */
      }
    },
    deleteAccount: async () => {
      const owner = recoveryOwner ?? uid;
      if (!owner) {
        throw new Error('Sign in first.');
      }
      registerPrivacySession(owner, null);
      setDeleting(true);
      try {
        await nativePrivacyService.deleteAccount(owner);
        setNativeRecoveryFailed(false);
        setRecoveryOwner(null);
      } catch (error) {
        setRecoveryOwner(await nativePrivacyService.recoveryOwner());
        throw error;
      }
    },
    reauthenticate: async () => {
      if (
        recoveryOwner &&
        getAuth(getApp()).currentUser?.uid &&
        getAuth(getApp()).currentUser?.uid !== recoveryOwner
      ) {
        await signOut(getAuth(getApp()));
        return;
      }
      const result = await new GoogleSignIn().signIn();
      if (result.error) {
        throw result.error;
      }
    },
  };
  if (isE2E) {
    return <>{children}</>;
  }
  if (loading || recoveryLoading) {
    return (
      <View style={{flex: 1, justifyContent: 'center'}}>
        <ActivityIndicator testID="privacy-loading" />
      </View>
    );
  }
  if (recoveryOwner || (uid && (consent === null || deleting || open))) {
    return (
      <View style={{flex: 1}}>
      {nativeRecoveryFailed ? <Text testID="privacy-native-recovery-error" accessibilityRole="alert">
        {language === 'he' ? 'ניקוי הנתונים במכשיר לא הושלם. נסו שוב את מחיקת החשבון.' : 'Device cleanup is incomplete. Retry account deletion.'}
      </Text> : null}
      <PrivacyView
        locale={language}
        runtime={{
          ...runtime,
          ...(uid && consent !== null && !deleting && !recoveryOwner
            ? {
                onClose: () => {
                  registerPrivacySession(uid, consent);
                  setOpen(false);
                },
              }
            : {}),
        }}
      />
      </View>
    );
  }
  return (
    <PrivacyControlsContext.Provider value={{openPrivacy: () => setOpen(true)}}>
      <React.Fragment key={generation}>{children}</React.Fragment>
    </PrivacyControlsContext.Provider>
  );
};
