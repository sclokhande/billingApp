const fs = require('fs');
const path = require('path');

const voiceBuildGradlePath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-native-voice',
  'voice',
  'android',
  'build.gradle'
);

if (fs.existsSync(voiceBuildGradlePath)) {
  const content = `apply plugin: 'com.android.library'

repositories {
    mavenLocal()
    mavenCentral()
    maven {
        url "$projectDir/../node_modules/react-native/android"
    }
    maven {
        url "$projectDir/../../react-native/android"
    }
}

android {
    namespace "com.wenkesj.voice"
    compileSdk rootProject.hasProperty('compileSdkVersion') ? rootProject.compileSdkVersion : 36
    buildToolsVersion rootProject.hasProperty('buildToolsVersion') ? rootProject.buildToolsVersion : "36.0.0"

    defaultConfig {
        minSdkVersion 24
        targetSdkVersion rootProject.hasProperty('targetSdkVersion') ? rootProject.targetSdkVersion : 36
        versionCode 1
        versionName "1.0"
    }
    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}

dependencies {
    implementation fileTree(dir: 'libs', include: ['*.jar'])
    testImplementation 'junit:junit:4.12'
    implementation 'androidx.appcompat:appcompat:1.6.1'
    implementation 'com.facebook.react:react-native:+'
}
`;
  fs.writeFileSync(voiceBuildGradlePath, content, 'utf8');
  console.log('Successfully patched @react-native-voice/voice android/build.gradle');
}

// 2. Patch VoiceModule.java so getName() returns "Voice"
const voiceModuleJavaPath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-native-voice',
  'voice',
  'android',
  'src',
  'main',
  'java',
  'com',
  'wenkesj',
  'voice',
  'VoiceModule.java'
);

if (fs.existsSync(voiceModuleJavaPath)) {
  let javaContent = fs.readFileSync(voiceModuleJavaPath, 'utf8');
  if (javaContent.includes('return "RCTVoice";')) {
    javaContent = javaContent.replace('return "RCTVoice";', 'return "Voice";');
    fs.writeFileSync(voiceModuleJavaPath, javaContent, 'utf8');
    console.log('Successfully patched @react-native-voice/voice VoiceModule.java (getName = "Voice")');
  }
}

// 3. Patch dist/index.js to support dynamic NativeModules.Voice || NativeModules.RCTVoice resolution
const voiceDistIndexPath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-native-voice',
  'voice',
  'dist',
  'index.js'
);

if (fs.existsSync(voiceDistIndexPath)) {
  const dynamicJsContent = `"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_native_1 = require("react-native");
const invariant_1 = __importDefault(require("invariant"));

function getVoiceModule() {
    return react_native_1.NativeModules.Voice || react_native_1.NativeModules.RCTVoice;
}

let _voiceEmitter = null;
function getVoiceEmitter() {
    const Voice = getVoiceModule();
    if (react_native_1.Platform.OS !== 'web' && Voice) {
        if (!_voiceEmitter) {
            _voiceEmitter = new react_native_1.NativeEventEmitter(Voice);
        }
        return _voiceEmitter;
    }
    return null;
}

class RCTVoice {
    constructor() {
        this._loaded = false;
        this._listeners = null;
        this._events = {
            onSpeechStart: () => { },
            onSpeechRecognized: () => { },
            onSpeechEnd: () => { },
            onSpeechError: () => { },
            onSpeechResults: () => { },
            onSpeechPartialResults: () => { },
            onSpeechVolumeChanged: () => { },
        };
    }
    removeAllListeners() {
        const Voice = getVoiceModule();
        if (Voice) {
            Voice.onSpeechStart = undefined;
            Voice.onSpeechRecognized = undefined;
            Voice.onSpeechEnd = undefined;
            Voice.onSpeechError = undefined;
            Voice.onSpeechResults = undefined;
            Voice.onSpeechPartialResults = undefined;
            Voice.onSpeechVolumeChanged = undefined;
        }
    }
    destroy() {
        const Voice = getVoiceModule();
        if (!Voice || (!this._loaded && !this._listeners)) {
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            Voice.destroySpeech((error) => {
                if (error) {
                    reject(new Error(error));
                }
                else {
                    if (this._listeners) {
                        this._listeners.map(listener => listener.remove());
                        this._listeners = null;
                    }
                    resolve();
                }
            });
        });
    }
    start(locale, options = {}) {
        const Voice = getVoiceModule();
        if (!Voice) {
            return Promise.reject(new Error('Voice native module is not linked or available.'));
        }
        const emitter = getVoiceEmitter();
        if (!this._loaded && !this._listeners && emitter !== null) {
            this._listeners = Object.keys(this._events).map((key) => emitter.addListener(key, this._events[key]));
        }
        return new Promise((resolve, reject) => {
            const callback = (error) => {
                if (error) {
                    reject(new Error(error));
                }
                else {
                    resolve();
                }
            };
            if (react_native_1.Platform.OS === 'android') {
                Voice.startSpeech(locale, Object.assign({
                    EXTRA_LANGUAGE_MODEL: 'LANGUAGE_MODEL_FREE_FORM',
                    EXTRA_MAX_RESULTS: 5,
                    EXTRA_PARTIAL_RESULTS: true,
                    REQUEST_PERMISSIONS_AUTO: true,
                }, options), callback);
            }
            else {
                Voice.startSpeech(locale, callback);
            }
        });
    }
    stop() {
        const Voice = getVoiceModule();
        if (!Voice || (!this._loaded && !this._listeners)) {
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            Voice.stopSpeech(error => {
                if (error) {
                    reject(new Error(error));
                }
                else {
                    resolve();
                }
            });
        });
    }
    cancel() {
        const Voice = getVoiceModule();
        if (!Voice || (!this._loaded && !this._listeners)) {
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            Voice.cancelSpeech(error => {
                if (error) {
                    reject(new Error(error));
                }
                else {
                    resolve();
                }
            });
        });
    }
    isAvailable() {
        const Voice = getVoiceModule();
        if (!Voice) {
            return Promise.resolve(false);
        }
        return new Promise((resolve, reject) => {
            Voice.isSpeechAvailable((isAvailable, error) => {
                if (error) {
                    reject(new Error(error));
                }
                else {
                    resolve(isAvailable);
                }
            });
        });
    }
    getSpeechRecognitionServices() {
        const Voice = getVoiceModule();
        if (react_native_1.Platform.OS !== 'android') {
            invariant_1.default(Voice, 'Speech recognition services can be queried for only on Android');
            return;
        }
        return Voice ? Voice.getSpeechRecognitionServices() : [];
    }
    isRecognizing() {
        const Voice = getVoiceModule();
        if (!Voice) {
            return Promise.resolve(false);
        }
        return new Promise(resolve => {
            Voice.isRecognizing((isRecognizing) => resolve(isRecognizing));
        });
    }
    set onSpeechStart(fn) {
        this._events.onSpeechStart = fn;
    }
    set onSpeechRecognized(fn) {
        this._events.onSpeechRecognized = fn;
    }
    set onSpeechEnd(fn) {
        this._events.onSpeechEnd = fn;
    }
    set onSpeechError(fn) {
        this._events.onSpeechError = fn;
    }
    set onSpeechResults(fn) {
        this._events.onSpeechResults = fn;
    }
    set onSpeechPartialResults(fn) {
        this._events.onSpeechPartialResults = fn;
    }
    set onSpeechVolumeChanged(fn) {
        this._events.onSpeechVolumeChanged = fn;
    }
}
exports.default = new RCTVoice();
`;
  fs.writeFileSync(voiceDistIndexPath, dynamicJsContent, 'utf8');
  console.log('Successfully patched @react-native-voice/voice dist/index.js with dynamic NativeModules loader');
}


