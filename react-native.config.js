module.exports = {
  dependencies: {
    // Login already uses Supabase OAuth + expo-web-browser. Excluding the
    // obsolete native Google Sign-In module from this build removes a full
    // Android/Kotlin dependency tree without changing runtime authentication.
    '@react-native-google-signin/google-signin': {
      platforms: {
        android: null,
      },
    },
  },
};
