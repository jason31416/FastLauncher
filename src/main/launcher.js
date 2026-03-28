import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import os from 'os';
import { EventEmitter } from 'events';
import { createHash, randomUUID } from 'crypto';
import AdmZip from 'adm-zip';
import { getMinecraftDir, getJVMArgs, getGameArgs, filterByOS, ensureDir } from './utils.js';
import { javaManager } from './javaManager.js';
import { FABRIC_ENABLED, FABRIC_MC_VERSION, getFabricClasspath } from './fabric.js';

const VERSION_ID = FABRIC_MC_VERSION;

export class GameLauncher extends EventEmitter {
  constructor(versionJson, fabricData = null) {
    super();
    this.versionJson = versionJson;
    this.fabricData = fabricData;
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
    
    if (FABRIC_ENABLED && this.fabricData) {
      const fabricClasspath = getFabricClasspath(this.fabricData, this.versionJson);
      classpath.push(...fabricClasspath);
      console.log('[LAUNCHER] Added', fabricClasspath.length, 'Fabric libraries to classpath');
    }
    
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
    const classpath = this.buildClasspath(); // 预先计算 classpath

    // 用于跳过下一个参数的标志
    let skipNext = false;

    for (const arg of jvmArgs) {
      // 处理普通字符串
      if (typeof arg === 'string') {
        if (skipNext) {
          skipNext = false;
          continue;
        }

        // 跳过 -cp 和 -classpath 选项本身
        if (arg === '-cp' || arg === '-classpath') {
          skipNext = true;
          continue;
        }

        // 替换变量
        let expanded = arg
            .replace(/\$\{natives_directory\}/g, this.nativesDir)
            .replace(/\$\{launcher_name\}/g, 'fastlauncher')
            .replace(/\$\{launcher_version\}/g, '1.0.0')
            .replace(/\$\{classpath\}/g, classpath);

        // 如果替换后变成了 classpath 字符串，说明是 ${classpath}，直接跳过
        if (expanded === classpath) {
          continue;
        }

        // 其他处理（如 HeapDumpPath 等）
        if (expanded.includes('-XX:HeapDumpPath=') && process.platform !== 'win32') {
          continue;
        }

        args.push(expanded);
      }
      // 处理数组形式的参数（某些版本 JSON 会有数组结构）
      else if (Array.isArray(arg)) {
        for (let i = 0; i < arg.length; i++) {
          const a = arg[i];
          if (skipNext) {
            skipNext = false;
            continue;
          }
          if (typeof a === 'string') {
            if (a === '-cp' || a === '-classpath') {
              skipNext = true;
              continue;
            }
            let expanded = a
                .replace(/\$\{natives_directory\}/g, this.nativesDir)
                .replace(/\$\{launcher_name\}/g, 'fastlauncher')
                .replace(/\$\{launcher_version\}/g, '1.0.0')
                .replace(/\$\{classpath\}/g, classpath);
            if (expanded === classpath) continue;
            if (expanded.includes('-XX:HeapDumpPath=') && process.platform !== 'win32') continue;
            args.push(expanded);
          } else {
            // 递归处理内部对象（如果有）
            args.push(a);
          }
        }
      }
      // 处理带规则的对象
      else if (arg && typeof arg === 'object' && arg.rules) {
        if (filterByOS(arg.rules)) {
          if (Array.isArray(arg.value)) {
            for (let i = 0; i < arg.value.length; i++) {
              const val = arg.value[i];
              if (skipNext) {
                skipNext = false;
                continue;
              }
              if (val === '-cp' || val === '-classpath') {
                skipNext = true;
                continue;
              }
              let expanded = typeof val === 'string' ? val.replace(/\$\{natives_directory\}/g, this.nativesDir) : val;
              if (expanded === classpath) continue;
              if (expanded.includes('-XX:HeapDumpPath=') && process.platform !== 'win32') continue;
              args.push(expanded);
            }
          } else if (typeof arg.value === 'string') {
            if (skipNext) {
              skipNext = false;
              continue;
            }
            if (arg.value === '-cp' || arg.value === '-classpath') {
              skipNext = true;
              continue;
            }
            let expanded = arg.value.replace(/\$\{natives_directory\}/g, this.nativesDir);
            if (expanded === classpath) continue;
            if (expanded.includes('-XX:HeapDumpPath=') && process.platform !== 'win32') continue;
            args.push(expanded);
          }
        }
      }
    }

    // 添加 macOS 专用参数
    if (process.platform === 'darwin') {
      args.push('-XstartOnFirstThread');
    }

    // 添加你的自定义 JVM 参数
    args.push(`-Xmx4G`);
    args.push(`-Xms256M`);
    args.push(`-XX:+UseG1GC`);
    args.push(`-XX:-UseAdaptiveSizePolicy`);
    args.push(`-XX:-OmitStackTraceInFastThrow`);

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
          .replace(/\$\{auth_xuid\}/g, profile.xuid || '')
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
              .replace(/\$\{auth_xuid\}/g, profile.xuid || '')
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
        // 检查规则是否允许
        let allowed = true;
        for (const rule of arg.rules) {
          if (rule.action === 'allow') {
            // 如果有 features 规则，且要求 is_demo_user = true，但我们是离线模式，应该跳过
            if (rule.features && rule.features.is_demo_user === true) {
              allowed = false;
              break;
            }
            // 其他 features 规则（如 has_custom_resolution）可以允许
            if (rule.features && rule.features.has_custom_resolution === true) {
              // 允许自定义分辨率参数
              continue;
            }
            if (rule.features && rule.features.has_quick_plays_support === true) {
              // 我们不需要快速启动功能，跳过
              allowed = false;
              break;
            }
            if (rule.features && (rule.features.is_quick_play_singleplayer === true ||
                rule.features.is_quick_play_multiplayer === true ||
                rule.features.is_quick_play_realms === true)) {
              // 跳过快速启动参数
              allowed = false;
              break;
            }
          } else if (rule.action === 'disallow') {
            // 如果有 disallow 规则且匹配，则不允许
            if (rule.features && rule.features.is_demo_user === true) {
              // 对于非 demo 用户，disallow demo 特性，所以允许
              allowed = true;
            } else {
              allowed = false;
              break;
            }
          }
        }

        // 只有允许时才添加参数
        if (allowed && filterByOS(arg.rules)) {
          if (Array.isArray(arg.value)) {
            // 替换占位符
            for (const val of arg.value) {
              const expanded = typeof val === 'string' ? val
                  .replace(/\$\{auth_player_name\}/g, profile.username)
                  .replace(/\$\{version_name\}/g, VERSION_ID)
                  .replace(/\$\{game_directory\}/g, getMinecraftDir())
                  .replace(/\$\{assets_root\}/g, path.join(getMinecraftDir(), 'assets'))
                  .replace(/\$\{assets_index_name\}/g, this.versionJson.assets)
                  .replace(/\$\{auth_uuid\}/g, profile.uuid)
                  .replace(/\$\{auth_access_token\}/g, profile.accessToken)
                  .replace(/\$\{clientid\}/g, profile.clientId)
                  .replace(/\$\{auth_xuid\}/g, profile.xuid || '')
                  .replace(/\$\{user_type\}/g, profile.userType)
                  .replace(/\$\{version_type\}/g, 'release')
                  .replace(/\$\{resolution_width\}/g, '854')
                  .replace(/\$\{resolution_height\}/g, '480')
                  .replace(/\$\{quickPlayPath\}/g, '')
                  .replace(/\$\{quickPlaySingleplayer\}/g, '')
                  .replace(/\$\{quickPlayMultiplayer\}/g, '')
                  .replace(/\$\{quickPlayRealms\}/g, '') : val;
              args.push(expanded);
            }
          } else if (typeof arg.value === 'string') {
            const expanded = arg.value
                .replace(/\$\{auth_player_name\}/g, profile.username)
                .replace(/\$\{version_name\}/g, VERSION_ID)
                .replace(/\$\{game_directory\}/g, getMinecraftDir())
                .replace(/\$\{assets_root\}/g, path.join(getMinecraftDir(), 'assets'))
                .replace(/\$\{assets_index_name\}/g, this.versionJson.assets)
                .replace(/\$\{auth_uuid\}/g, profile.uuid)
                .replace(/\$\{auth_access_token\}/g, profile.accessToken)
                .replace(/\$\{clientid\}/g, profile.clientId)
                .replace(/\$\{auth_xuid\}/g, profile.xuid || '')
                .replace(/\$\{user_type\}/g, profile.userType)
                .replace(/\$\{version_type\}/g, 'release')
                .replace(/\$\{resolution_width\}/g, '854')
                .replace(/\$\{resolution_height\}/g, '480')
                .replace(/\$\{quickPlayPath\}/g, '')
                .replace(/\$\{quickPlaySingleplayer\}/g, '')
                .replace(/\$\{quickPlayMultiplayer\}/g, '')
                .replace(/\$\{quickPlayRealms\}/g, '');
            args.push(expanded);
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
    
    const requiredJavaVersion = this.versionJson.javaVersion?.majorVersion || 17;
    const javaPath = await javaManager.ensureJava(requiredJavaVersion);
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
    console.log('[LAUNCHER]', javaPath, fullArgs.join(' '));

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

  async kill() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}

export function createOfflineProfile(username) {
  const hash = createHash('md5').update('OfflinePlayer:' + username).digest();
  hash[6] = (hash[6] & 0x0f) | 0x30;
  hash[8] = (hash[8] & 0x3f) | 0x80;

  const uuid = [
    hash.slice(0, 4).toString('hex'),
    hash.slice(4, 6).toString('hex'),
    hash.slice(6, 8).toString('hex'),
    hash.slice(8, 10).toString('hex'),
    hash.slice(10, 16).toString('hex')
  ].join('-');

  return {
    username,
    uuid,
    accessToken: randomUUID().replace(/-/g, ''),
    userType: 'legacy',
    clientId: 'offline',
    xuid: '0'
  };
}