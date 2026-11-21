import 'react-native-url-polyfill/auto';
import 'react-native-get-random-values';
import {AppRegistry} from 'react-native';
import notifee from '@notifee/react-native';
import App from './src/App';
import {name as appName} from './app.json';

// Register the main application component
AppRegistry.registerComponent(appName, () => App);

// Register background notification handler
// This runs when a notification event fires while the app is in the background or killed
notifee.onBackgroundEvent(async ({type, detail}) => {
  try {
    const {notification, pressAction} = detail;

    // Log background events for debugging
    console.log('[Notifee Background]', type, notification?.id, pressAction?.id);

    // Handle specific press actions if needed
    // Additional background handling (e.g. check-in from notification)
    // will be added by the services layer
  } catch (err) {
    console.error('[Notifee Background Error]', err);
  }
});
