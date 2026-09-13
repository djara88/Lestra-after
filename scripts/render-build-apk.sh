#!/usr/bin/env bash
set -euo pipefail

ROOT="$PWD"
CACHE_DIR="$ROOT/.render-build"
JDK_DIR="$CACHE_DIR/jdk"
ANDROID_DIR="$CACHE_DIR/android-sdk"
mkdir -p "$CACHE_DIR" "$ANDROID_DIR/cmdline-tools"

export CI=1
export JAVA_HOME="$JDK_DIR"
export ANDROID_HOME="$ANDROID_DIR"
export ANDROID_SDK_ROOT="$ANDROID_DIR"
export PATH="$JAVA_HOME/bin:$ANDROID_DIR/cmdline-tools/latest/bin:$ANDROID_DIR/platform-tools:$PATH"

if [ ! -x "$JAVA_HOME/bin/java" ]; then
  echo "Downloading JDK 17..."
  curl -L --fail --retry 3 --retry-delay 2 \
    "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse" \
    -o "$CACHE_DIR/jdk.tar.gz"
  rm -rf "$JDK_DIR" "$CACHE_DIR/jdk-extract"
  mkdir -p "$CACHE_DIR/jdk-extract"
  tar -xzf "$CACHE_DIR/jdk.tar.gz" -C "$CACHE_DIR/jdk-extract"
  extracted_jdk=$(find "$CACHE_DIR/jdk-extract" -mindepth 1 -maxdepth 1 -type d | head -n 1)
  test -n "$extracted_jdk"
  mv "$extracted_jdk" "$JDK_DIR"
fi

java -version

if [ ! -x "$ANDROID_DIR/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "Downloading Android command-line tools..."
  curl -L --fail --retry 3 --retry-delay 2 \
    "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" \
    -o "$CACHE_DIR/android-cli.zip"
  rm -rf "$CACHE_DIR/android-cli" "$ANDROID_DIR/cmdline-tools/latest"
  mkdir -p "$CACHE_DIR/android-cli"
  unzip -q "$CACHE_DIR/android-cli.zip" -d "$CACHE_DIR/android-cli"
  mkdir -p "$ANDROID_DIR/cmdline-tools/latest"
  cp -R "$CACHE_DIR/android-cli/cmdline-tools/." "$ANDROID_DIR/cmdline-tools/latest/"
fi

set +o pipefail
yes | sdkmanager --sdk_root="$ANDROID_DIR" --licenses >/dev/null
set -o pipefail
sdkmanager --sdk_root="$ANDROID_DIR" \
  "platform-tools" \
  "platforms;android-35" \
  "build-tools;35.0.0"

npm install --ignore-scripts --no-fund
npm run typecheck
npx expo install --check
npx expo prebuild --platform android --clean --no-install

cd android
chmod +x gradlew
./gradlew assembleRelease --no-daemon \
  -Dorg.gradle.jvmargs="-Xmx1536m -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8"
cd "$ROOT"

test -f android/app/build/outputs/apk/release/app-release.apk
unzip -l android/app/build/outputs/apk/release/app-release.apk | grep -E 'assets/index.android.bundle|assets/.*\.bundle' >/dev/null

mkdir -p apk
cp android/app/build/outputs/apk/release/app-release.apk apk/Lestra-After-Beta-0.5.5.apk
sha256sum apk/Lestra-After-Beta-0.5.5.apk | tee apk/Lestra-After-Beta-0.5.5.sha256
ls -lh apk/Lestra-After-Beta-0.5.5.apk
