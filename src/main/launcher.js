import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import os from 'os';
import { EventEmitter } from 'events';
import { createHash, randomUUID } from 'crypto';
import AdmZip from 'adm-zip';
import { getMinecraftDir, getJVMArgs, getGameArgs, filterByOS, ensureDir } from './utils.js';

const VERSION_ID = '1.21.1';

export class GameLauncher extends EventEmitter {
  constructor(versionJson) {
    super();
    this.versionJson = versionJson;
    this.process = null;
    this.nativesDir = null;
  }

  async prepareNatives() {
    console.log('[LAUNCHER] prepareNatives started');
    const minecraftDir = getMinecraftDir();
    this.nativesDir = path.join(minecraftDir, 'natives', VERSION_ID);
    
    await ensureDir(this.nativesDir);
    console.log('[LAUNCHER] Natives dir:', this.nativesDir);
    
    const natives = this.versionJson.libraries
      .filter(lib => {
        if (!filterByOS(lib.rules)) return false;
        if (!lib.downloads?.classifiers) return false;
        return true;
      })
      .flatMap(lib => {
        const classifiers = lib.downloads.classifiers;
        const keys = Object.keys(classifiers).filter(k => k.startsWith('natives-'));
        return keys.map(key => ({
          lib,
          classifier: classifiers[key]
        }));
      });

    console.log('[LAUNCHER] Found', natives.length, 'native libraries to extract');

    for (const { classifier } of natives) {
      const nativePath = path.join(getMinecraftDir(), 'libraries', classifier.path);
      const nativeFile = path.join(this.nativesDir, path.basename(classifier.path));
      
      try {
        const stat = await fs.stat(nativePath);
        console.log('[LAUNCHER] Extracting native:', classifier.path, 'size:', stat.size);
        const admZip = new AdmZip(nativePath);
        admZip.extractAllTo(this.nativesDir, true);
      } catch (e) {
        console.error('[LAUNCHER] Failed to extract native', classifier.path, ':', e.message);
        this.emit('warning', `Failed to extract native ${classifier.path}: ${e.message}`);
      }
    }

    console.log('[LAUNCHER] prepareNatives completed');
    return this.nativesDir;
  }

  buildClasspath() {
    const minecraftDir = getMinecraftDir();
    const separator = process.platform === 'windows' ? ';' : ':';
    
    const classpath = [];
    
    for (const lib of this.versionJson.libraries) {
      if (!filterByOS(lib.rules)) continue;
      if (!lib.downloads?.artifact) continue;
      
      const libPath = path.join(minecraftDir, 'libraries', lib.downloads.artifact.path);
      classpath.push(libPath);
    }
    
    const clientJar = path.join(minecraftDir, 'versions', VERSION_ID, `${VERSION_ID}.jar`);
    classpath.push(clientJar);
    
    console.log('[LAUNCHER] Classpath has', classpath.length, 'entries');
    console.log('[LAUNCHER] Client jar:', clientJar);
    
    return classpath.join(separator);
  }

  buildJvmArgs() {
    const args = [];
    
    const jvmArgs = this.versionJson.arguments?.jvm || [];
    console.log('[LAUNCHER] Raw JVM args from version.json:', jvmArgs.length);
    
    for (const arg of jvmArgs) {
      if (typeof arg === 'string') {
        const expanded = arg
          .replace(/\$\{natives_directory\}/g, this.nativesDir)
          .replace(/\$\{launcher_name\}/g, 'fastlauncher')
          .replace(/\$\{launcher_version\}/g, '1.0.0')
          .replace(/\$\{classpath\}/g, this.buildClasspath());
        
        if (expanded === '-cp' || expanded === '${classpath}') continue;
        
        if (expanded.includes('-XX:HeapDumpPath=')) {
          const heapDumpPath = expanded.split('=')[1];
          if (process.platform === 'win32') {
            args.push(`-XX:HeapDumpPath=${heapDumpPath}`);
          }
          continue;
        }
        
        args.push(expanded);
      } else if (Array.isArray(arg)) {
        for (const a of arg) {
          if (typeof a === 'string') {
            const expanded = a
              .replace(/\$\{natives_directory\}/g, this.nativesDir)
              .replace(/\$\{launcher_name\}/g, 'fastlauncher')
              .replace(/\$\{launcher_version\}/g, '1.0.0');
            args.push(expanded);
          }
        }
      } else if (arg && typeof arg === 'object' && arg.rules) {
        if (filterByOS(arg.rules)) {
          if (Array.isArray(arg.value)) {
            for (const a of arg.value) {
              if (typeof a === 'string') {
                args.push(a.replace(/\$\{natives_directory\}/g, this.nativesDir));
              }
            }
          } else if (typeof arg.value === 'string') {
            args.push(arg.value.replace(/\$\{natives_directory\}/g, this.nativesDir));
          }
        }
      }
    }
    
    if (process.platform === 'darwin') {
      args.push('-XstartOnFirstThread');
    }
    
    args.push(`-Xmx4G`);
    args.push(`-Xms256M`);
    args.push(`-XX:+UseG1GC`);
    args.push(`-XX:-UseAdaptiveSizePolicy`);
    args.push(`-XX:-OmitStackTraceInFastThrow`);
    
    console.log('[LAUNCHER] Built JVM args, final count:', args.length);
    
    return args;
  }

  buildGameArgs(profile) {
    const args = [];
    
    const gameArgs = this.versionJson.arguments?.game || [];
    
    for (const arg of gameArgs) {
      if (typeof arg === 'string') {
        const expanded = arg
          .replace(/\$\{auth_player_name\}/g, profile.username)
          .replace(/\$\{version_name\}/g, VERSION_ID)
          .replace(/\$\{game_directory\}/g, getMinecraftDir())
          .replace(/\$\{assets_root\}/g, path.join(getMinecraftDir(), 'assets'))
          .replace(/\$\{assets_index_name\}/g, this.versionJson.assets)
          .replace(/\$\{auth_uuid\}/g, profile.uuid)
          .replace(/\$\{auth_access_token\}/g, profile.accessToken)
          .replace(/\$\{clientid\}/g, profile.clientId)
          .replace(/\$\{auth_xuid\}/g, '')
          .replace(/\$\{user_type\}/g, profile.userType)
          .replace(/\$\{version_type\}/g, 'release')
          .replace(/\$\{resolution_width\}/g, '854')
          .replace(/\$\{resolution_height\}/g, '480')
          .replace(/\$\{quickPlayPath\}/g, '')
          .replace(/\$\{quickPlaySingleplayer\}/g, '')
          .replace(/\$\{quickPlayMultiplayer\}/g, '')
          .replace(/\$\{quickPlayRealms\}/g, '');
        
        args.push(expanded);
      } else if (Array.isArray(arg)) {
        const expandedArr = arg.map(a => {
          if (typeof a === 'string') {
            return a
              .replace(/\$\{auth_player_name\}/g, profile.username)
              .replace(/\$\{version_name\}/g, VERSION_ID)
              .replace(/\$\{game_directory\}/g, getMinecraftDir())
              .replace(/\$\{assets_root\}/g, path.join(getMinecraftDir(), 'assets'))
              .replace(/\$\{assets_index_name\}/g, this.versionJson.assets)
              .replace(/\$\{auth_uuid\}/g, profile.uuid)
              .replace(/\$\{auth_access_token\}/g, profile.accessToken)
              .replace(/\$\{clientid\}/g, profile.clientId)
              .replace(/\$\{auth_xuid\}/g, '')
              .replace(/\$\{user_type\}/g, profile.userType)
              .replace(/\$\{version_type\}/g, 'release')
              .replace(/\$\{resolution_width\}/g, '854')
              .replace(/\$\{resolution_height\}/g, '480')
              .replace(/\$\{quickPlayPath\}/g, '')
              .replace(/\$\{quickPlaySingleplayer\}/g, '')
              .replace(/\$\{quickPlayMultiplayer\}/g, '')
              .replace(/\$\{quickPlayRealms\}/g, '');
          }
          return a;
        });
        args.push(...expandedArr);
      } else if (arg && typeof arg === 'object' && arg.rules) {
        if (filterByOS(arg.rules)) {
          if (Array.isArray(arg.value)) {
            args.push(...arg.value);
          } else if (typeof arg.value === 'string') {
            args.push(arg.value);
          }
        }
      }
    }
    
    return args;
  }

  async launch(profile) {
    console.log('[LAUNCHER] Starting launch process...');
    
    await this.prepareNatives();
    console.log('[LAUNCHER] Natives prepared at:', this.nativesDir);
    
    const jvmArgs = this.buildJvmArgs();
    console.log('[LAUNCHER] JVM args built:', jvmArgs.length, 'entries');
    
    const gameArgs = this.buildGameArgs(profile);
    console.log('[LAUNCHER] Game args built:', gameArgs.length, 'entries');
    
    const classpath = this.buildClasspath();
    console.log('[LAUNCHER] Classpath built, length:', classpath.length);
    
    const javaPath = this.findJava();
    console.log('[LAUNCHER] Java path:', javaPath);
    
    const fullArgs = [
      ...jvmArgs,
      '-Djava.library.path=' + this.nativesDir,
      '-Djna.tmpdir=' + this.nativesDir,
      '-Dorg.lwjgl.system.SharedLibraryExtractPath=' + this.nativesDir,
      '-Dio.netty.native.workdir=' + this.nativesDir,
      '-cp', classpath,
      this.versionJson.mainClass,
      ...gameArgs
    ];

    console.log('[LAUNCHER] Full command:');
    console.log('[LAUNCHER]', javaPath, fullArgs.join(' ').substring(0, 500) + '...');

    this.emit('launch', {
      javaPath,
      args: fullArgs,
      cwd: getMinecraftDir()
    });

    return new Promise((resolve, reject) => {
      this.process = spawn(javaPath, fullArgs, {
        cwd: getMinecraftDir(),
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
        env: { ...process.env, LANG: 'en_US.UTF-8' }
      });

      let gameStarted = false;
      let stdoutBuffer = [];
      let stderrBuffer = [];

      this.process.on('error', (err) => {
        console.error('[LAUNCHER] Process error:', err);
        this.emit('error', err);
        reject(err);
      });

      this.process.on('exit', (code, signal) => {
        console.log('[LAUNCHER] Process exited with code:', code, 'signal:', signal);
        console.log('[LAUNCHER] Stdout buffer:', stdoutBuffer.slice(-10).join(''));
        console.log('[LAUNCHER] Stderr buffer:', stderrBuffer.slice(-10).join(''));
        
        if (!gameStarted) {
          reject(new Error(`Game process exited with code ${code}`));
        }
        this.emit('exit', code);
      });

      this.process.stdout.on('data', (data) => {
        const log = data.toString();
        stdoutBuffer.push(log);
        if (stdoutBuffer.length > 100) stdoutBuffer.shift();
        this.emit('stdout', log);
      });

      this.process.stderr.on('data', (data) => {
        const log = data.toString();
        stderrBuffer.push(log);
        if (stderrBuffer.length > 100) stderrBuffer.shift();
        console.log('[LAUNCHER] [STDERR]', log);
        this.emit('stderr', log);
      });

      setTimeout(() => {
        gameStarted = true;
        console.log('[LAUNCHER] Game considered started');
        this.emit('started');
        this.process.unref();
        resolve();
      }, 5000);
    });
  }

  findJava() {
    const javaHome = process.env.JAVA_HOME;
    console.log('[LAUNCHER] JAVA_HOME:', javaHome);
    console.log('[LAUNCHER] process.env:', JSON.stringify(process.env).substring(0, 200));
    
    if (javaHome) {
      const javaPath = path.join(javaHome, 'bin', 'java');
      console.log('[LAUNCHER] Using JAVA_HOME java:', javaPath);
      return javaPath;
    }
    
    const javaPath = process.platform === 'windows' ? 'java.exe' : 'java';
    console.log('[LAUNCHER] Using system java:', javaPath);
    return javaPath;
  }

  async kill() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

export function createOfflineProfile(username) {
  const hash = createHash('md5').update(username).digest('hex');
  const uuid = hash.substring(0, 8) + '-' + 
               hash.substring(8, 12) + '-' + 
               hash.substring(12, 16) + '-' + 
               hash.substring(16, 20) + '-' + 
               hash.substring(20, 32);
  
  return {
    username,
    uuid,
    accessToken: '0',
    userType: 'legacy',
    clientId: randomUUID()
  };
}
