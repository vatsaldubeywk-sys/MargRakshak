import React, { useState, useEffect, createContext, useContext, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  BackHandler,
  useColorScheme,
  StatusBar,
} from 'react-native';
import { RootStackParamList } from '../types';
import { COLORS } from '../constants';

import { HomeScreen } from '../screens/HomeScreen';
import { AuthScreen } from '../screens/AuthScreen';
import { ContactsScreen } from '../screens/ContactsScreen';
import { SessionSetupScreen } from '../screens/SessionSetupScreen';

export type ScreenName = keyof RootStackParamList;

interface NavigationEntry {
  name: ScreenName;
  params?: any;
}

interface NavigationContextType {
  currentRoute: NavigationEntry;
  navigate: (name: ScreenName, params?: any) => void;
  goBack: () => void;
  canGoBack: () => boolean;
  setParams: (params: any) => void;
}

const NavigationContext = createContext<NavigationContextType | null>(null);

export const useAppNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useAppNavigation must be used within AppNavigator');
  }
  return context;
};

export const AppNavigator: React.FC = () => {
  const isDark = useColorScheme() === 'dark';
  const [history, setHistory] = useState<NavigationEntry[]>([
    { name: 'Home', params: undefined },
  ]);

  const currentRoute = history[history.length - 1];

  const navigate = useCallback((name: ScreenName, params?: any) => {
    setHistory((prev) => {
      // If navigating to the same top screen, update params
      const last = prev[prev.length - 1];
      if (last.name === name) {
        return [...prev.slice(0, -1), { name, params: { ...last.params, ...params } }];
      }
      return [...prev, { name, params }];
    });
  }, []);

  const goBack = useCallback(() => {
    setHistory((prev) => {
      if (prev.length > 1) {
        return prev.slice(0, -1);
      }
      return prev;
    });
  }, []);

  const canGoBack = useCallback(() => history.length > 1, [history.length]);

  const setParams = useCallback((newParams: any) => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      return [...prev.slice(0, -1), { ...last, params: { ...last.params, ...newParams } }];
    });
  }, []);

  // Handle hardware Android Back Button
  useEffect(() => {
    const onBackPress = () => {
      if (history.length > 1) {
        goBack();
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [history.length, goBack]);

  const navigation = useMemo(
    () => ({
      navigate,
      goBack,
      canGoBack,
      setParams,
      push: navigate,
      replace: (name: ScreenName, params?: any) => {
        setHistory((prev) => [...prev.slice(0, -1), { name, params }]);
      },
      pop: goBack,
      popToTop: () => setHistory([{ name: 'Home', params: undefined }]),
      addListener: () => () => {},
      removeListener: () => {},
    }),
    [navigate, goBack, canGoBack, setParams]
  );

  const route = useMemo(
    () => ({
      name: currentRoute.name,
      params: currentRoute.params || {},
      key: `${currentRoute.name}-${history.length}`,
    }),
    [currentRoute, history.length]
  );

  const screenProps = {
    navigation: navigation as any,
    route: route as any,
  };

  const navContextValue = useMemo(
    () => ({
      currentRoute,
      navigate,
      goBack,
      canGoBack,
      setParams,
    }),
    [currentRoute, navigate, goBack, canGoBack, setParams]
  );

  // Render header for sub-screens
  const renderHeader = (title: string) => {
    return (
      <View
        style={[
          styles.header,
          {
            backgroundColor: isDark ? '#141E21' : COLORS.surface,
            borderBottomColor: isDark ? '#26373B' : COLORS.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={goBack}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
        >
          <Text style={[styles.backArrow, { color: isDark ? '#E2F1EC' : COLORS.textPrimary }]}>
            ‹
          </Text>
          <Text style={[styles.backText, { color: isDark ? '#9EB3AC' : COLORS.textSecondary }]}>
            Back
          </Text>
        </TouchableOpacity>
        <Text
          style={[
            styles.headerTitle,
            { color: isDark ? '#E2F1EC' : COLORS.textPrimary },
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <View style={styles.headerRight} />
      </View>
    );
  };

  const renderActiveScreen = () => {
    switch (currentRoute.name) {
      case 'Auth':
        return (
          <View style={styles.screenWrapper}>
            {renderHeader('Account & Profile')}
            <AuthScreen {...screenProps} />
          </View>
        );
      case 'Contacts':
        return (
          <View style={styles.screenWrapper}>
            {renderHeader('Trusted Contacts')}
            <ContactsScreen {...screenProps} />
          </View>
        );
      case 'SessionSetup':
        return (
          <View style={styles.screenWrapper}>
            {renderHeader('Safety Session Setup')}
            <SessionSetupScreen {...screenProps} />
          </View>
        );
      case 'Home':
      default:
        return (
          <View style={styles.screenWrapper}>
            <HomeScreen {...screenProps} />
          </View>
        );
    }
  };

  return (
    <NavigationContext.Provider value={navContextValue}>
      <View
        style={[
          styles.container,
          { backgroundColor: isDark ? '#0F1618' : COLORS.background },
        ]}
      >
        {renderActiveScreen()}
      </View>
    </NavigationContext.Provider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  screenWrapper: {
    flex: 1,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 60,
  },
  backArrow: {
    fontSize: 32,
    lineHeight: 34,
    fontWeight: '300',
    marginRight: 4,
  },
  backText: {
    fontSize: 15,
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  headerRight: {
    minWidth: 60,
  },
});

export default AppNavigator;
