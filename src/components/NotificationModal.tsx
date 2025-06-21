import React from 'react';
import {Modal, View, Text, StyleSheet, TouchableOpacity} from 'react-native';

interface NotificationModalProps {
  visible: boolean;
  title?: string;
  body?: string;
  onClose: () => void;
}

const NotificationModal: React.FC<NotificationModalProps> = ({
  visible,
  title,
  body,
  onClose,
}) => (
  <Modal
    visible={visible}
    transparent
    animationType="fade"
    onRequestClose={onClose}
  >
    <View style={styles.overlay}>
      <View style={styles.container}>
        <Text style={styles.title}>{title || 'Notification'}</Text>
        {body ? <Text style={styles.body}>{body}</Text> : null}
        <TouchableOpacity onPress={onClose} style={styles.button}>
          <Text style={styles.buttonText}>Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '80%',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 20,
    elevation: 5,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  body: {
    fontSize: 16,
    marginBottom: 20,
  },
  button: {
    alignSelf: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  buttonText: {
    color: '#007AFF',
    fontSize: 16,
  },
});

export default NotificationModal;
