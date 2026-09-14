import type { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    ...config,
    name: 'Lestra After',
    slug: 'lestra-after',
    scheme: 'lestraafter',
    version: '0.5.5',
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    // Build-only branch: keep the classic architecture to reduce Android
    // compiler memory. The product branch remains unchanged.
    newArchEnabled: false,
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'app.lestra.after',
    },
    android: {
      package: 'app.lestra.after',
      versionCode: 6,
      adaptiveIcon: { backgroundColor: '#FFF8F1' },
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      [
        'expo-image-picker',
        {
          cameraPermission: 'After usa la cámara solo para fotografiar comunicaciones y tareas del colegio.',
          photosPermission: 'After accede a tus fotos solo cuando eliges una imagen para leerla.',
          microphonePermission: false,
        },
      ],
      ['expo-mlkit-ocr', { iosEngine: 'auto' }],
      [
        'expo-build-properties',
        {
          ios: {
            deploymentTarget: '16.0',
            useFrameworks: 'static',
          },
        },
      ],
    ],
    experiments: { typedRoutes: true },
  };
};
