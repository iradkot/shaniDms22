import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import {translations, Lang} from 'app/i18n/translations';

interface State {
  hasError: boolean;
  error: Error | null;
}

function getLanguage(): Lang {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || 'en';
    return locale.toLowerCase().startsWith('he') ? 'he' : 'en';
  } catch {
    return 'en';
  }
}

class ErrorBoundary extends React.Component<{}, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error('Uncaught error:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    const lang = getLanguage();
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>{translations[lang].errors.somethingWentWrong}</Text>
          <Text style={styles.message}>{this.state.error?.message}</Text>
          <Button title={translations[lang].errors.tryAgain} onPress={this.handleReset} />
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
});

export default ErrorBoundary;
