import React, {useEffect, useState} from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import type {MealImageInput, MealImageSnapshot} from '../../modules/journal';
import type {MealImagesRuntime} from '../../modules/mealMedia';
import {JournalButton, JournalFormActions, JournalNotice} from '../journal';
import type {MealsLocale} from './selectors';

const COPY = {
  en: {
    title: 'Meal photo',
    camera: 'Take photo',
    library: 'Choose photo',
    remove: 'Remove photo',
    selected: 'Photo ready. It will be available locally as soon as you save.',
    existing: 'Saved meal photo',
    removed: 'The photo will be removed when you save.',
    empty: 'A photo is optional.',
    errors: {
      permission_denied: 'Camera or photo access was not granted.',
      selection_failed: 'The image could not be selected.',
      unavailable: 'The selected image is unavailable.',
      too_large: 'Meal photos must be 10 MB or smaller.',
    },
    privacy:
      'Saving or syncing this photo does not send it to AI. Analysis starts only when you explicitly ask.',
  },
  he: {
    title: 'תמונת הארוחה',
    camera: 'צילום תמונה',
    library: 'בחירת תמונה',
    remove: 'הסרת התמונה',
    selected: 'התמונה מוכנה. היא תהיה זמינה מקומית מיד לאחר השמירה.',
    existing: 'תמונת הארוחה השמורה',
    removed: 'התמונה תוסר לאחר השמירה.',
    empty: 'אפשר לשמור את הארוחה גם בלי תמונה.',
    errors: {
      permission_denied: 'לא ניתנה גישה למצלמה או לתמונות.',
      selection_failed: 'לא הצלחנו לבחור את התמונה.',
      unavailable: 'התמונה שנבחרה אינה זמינה.',
      too_large: 'תמונת ארוחה יכולה להיות בגודל של עד 10 MB.',
    },
    privacy:
      'שמירה או סנכרון לא שולחים את התמונה ל־AI. ניתוח יתחיל רק לאחר בקשה מפורשת.',
  },
} as const;

export const useResolvedMealImageUri = (
  image: MealImageSnapshot | undefined,
  runtime: MealImagesRuntime | undefined,
): string | undefined => {
  const localUri = image?.syncState.localUri;
  const immediate =
    localUri !== undefined &&
    /^(?:https?:|blob:|data:image\/|file:|content:|ph:|assets-library:)/i.test(
      localUri,
    )
      ? localUri
      : undefined;
  const [uri, setUri] = useState<string | undefined>(immediate);
  useEffect(() => {
    let active = true;
    let leasedUri: string | undefined;
    setUri(immediate);
    if (image === undefined || runtime === undefined) {
      return () => {
        active = false;
      };
    }
    runtime.resolve(image).then(
      resolved => {
        if (active) {
          leasedUri = resolved;
          setUri(resolved ?? immediate);
        } else if (resolved !== undefined) {
          runtime.release?.(resolved);
        }
      },
      () => {
        if (active) {
          setUri(immediate);
        }
      },
    );
    return () => {
      active = false;
      if (leasedUri !== undefined) {
        runtime.release?.(leasedUri);
      }
    };
  }, [image, immediate, runtime]);
  return uri;
};

export const MealImagePreview = ({
  image,
  runtime,
  testID,
  compact = false,
}: {
  readonly image: MealImageSnapshot;
  readonly runtime?: MealImagesRuntime;
  readonly testID: string;
  readonly compact?: boolean;
}) => {
  const uri = useResolvedMealImageUri(image, runtime);
  return uri === undefined ? null : (
    <Image
      accessibilityIgnoresInvertColors
      resizeMode="cover"
      source={{uri}}
      style={compact ? styles.compactPreview : styles.preview}
      testID={testID}
    />
  );
};

export const MealImageField = ({
  locale,
  runtime,
  value,
  existing,
  disabled,
  onChange,
  testIDPrefix,
}: {
  readonly locale: MealsLocale;
  readonly runtime?: MealImagesRuntime;
  readonly value: MealImageInput | null | undefined;
  readonly existing?: MealImageSnapshot;
  readonly disabled: boolean;
  readonly onChange: (value: MealImageInput | null | undefined) => void;
  readonly testIDPrefix: string;
}) => {
  const copy = COPY[locale];
  const rtl = locale === 'he';
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const selectedUri = value && value !== null ? value.uri : undefined;

  useEffect(
    () => () => {
      if (selectedUri !== undefined) {
        runtime?.release?.(selectedUri);
      }
    },
    [runtime, selectedUri],
  );

  const select = async (source: 'camera' | 'library'): Promise<void> => {
    if (runtime === undefined) {
      return;
    }
    setPicking(true);
    setError(undefined);
    try {
      const result = await runtime.pick(source);
      if (result.kind === 'selected') {
        onChange(result.image);
      } else if (result.kind === 'error') {
        setError(copy.errors[result.code] ?? result.message);
      }
    } catch {
      setError(
        locale === 'he'
          ? 'לא הצלחנו לפתוח את התמונה.'
          : 'The image could not be opened.',
      );
    } finally {
      setPicking(false);
    }
  };

  if (runtime === undefined) {
    return null;
  }

  return (
    <View style={styles.field} testID={`${testIDPrefix}-image-field`}>
      <Text style={[styles.title, rtl && styles.rtl]}>{copy.title}</Text>
      {selectedUri !== undefined ? (
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          source={{uri: selectedUri}}
          style={styles.preview}
          testID={`${testIDPrefix}-image-preview`}
        />
      ) : value !== null && existing !== undefined ? (
        <MealImagePreview
          image={existing}
          runtime={runtime}
          testID={`${testIDPrefix}-image-preview`}
        />
      ) : null}
      <Text style={[styles.status, rtl && styles.rtl]}>
        {value === null
          ? copy.removed
          : selectedUri !== undefined
          ? copy.selected
          : existing !== undefined
          ? copy.existing
          : copy.empty}
      </Text>
      {error ? (
        <JournalNotice
          locale={locale}
          message={error}
          testID={`${testIDPrefix}-image-error`}
        />
      ) : null}
      <JournalFormActions locale={locale}>
        <JournalButton
          disabled={disabled || picking}
          label={copy.camera}
          onPress={() => select('camera')}
          testID={`${testIDPrefix}-image-camera`}
        />
        <JournalButton
          disabled={disabled || picking}
          label={copy.library}
          onPress={() => select('library')}
          testID={`${testIDPrefix}-image-library`}
        />
        {selectedUri !== undefined || existing !== undefined ? (
          <JournalButton
            disabled={disabled || picking}
            label={copy.remove}
            onPress={() => onChange(existing === undefined ? undefined : null)}
            testID={`${testIDPrefix}-image-remove`}
            tone="quiet"
          />
        ) : null}
      </JournalFormActions>
      <Text style={[styles.privacy, rtl && styles.rtl]}>{copy.privacy}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  field: {
    backgroundColor: '#F2F7FB',
    borderColor: '#D6E5EF',
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 14,
    padding: 12,
  },
  title: {color: '#243B53', fontSize: 14, fontWeight: '800', marginBottom: 8},
  rtl: {textAlign: 'right', writingDirection: 'rtl'},
  preview: {width: '100%', height: 190, borderRadius: 12, marginBottom: 9},
  compactPreview: {
    width: '100%',
    height: 92,
    borderRadius: 12,
    marginBottom: 10,
  },
  status: {color: '#486581', fontSize: 13, lineHeight: 18, marginBottom: 8},
  privacy: {color: '#627D98', fontSize: 12, lineHeight: 17},
});
