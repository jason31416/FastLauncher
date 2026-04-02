import path from 'path';
import { getMinecraftDir } from './utils.js';

const MINECRAFT_VERSION = '26.1';
const FABRIC_ENABLED = false;

export { MINECRAFT_VERSION, FABRIC_ENABLED };

const FABRIC_API_BASE = 'https://meta.fabricmc.net';
const FABRIC_MAVEN_BASE = 'https://maven.fabricmc.net/';

/** Fetch all available Fabric versions for a given Minecraft version */
export async function getFabricVersions(mcVersion) {
  const url = `${FABRIC_API_BASE}/v2/versions/loader/${mcVersion}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch Fabric versions: ${response.status}`);
  }
  return response.json();
}

/** Find the latest stable Fabric version, fallback to first available */
export async function getLatestFabricVersion(mcVersion) {
  const versions = await getFabricVersions(mcVersion);
  return versions.find(v => v.loader.stable === true) || versions[0];
}

/** Get Fabric version data for a Minecraft version (latest stable) */
export async function getFabricData(mcVersion) {
  const fabricVersion = await getLatestFabricVersion(mcVersion);
  return fabricVersion;
}

/**
 * Build a list of library download items from Fabric metadata.
 * Includes common libraries, the Fabric loader, and the intermediary JAR.
 */
export function buildFabricLibraryItems(fabricData) {
  const items = [];
  const libraries = fabricData.launcherMeta?.libraries?.common || [];

  for (const lib of libraries) {
    const name = lib.name;
    const url = lib.url || FABRIC_MAVEN_BASE;
    const sha1 = lib.sha1;
    const size = lib.size;

    const parts = name.split(':');
    if (parts.length !== 3) continue;

    const [groupId, artifactId, version] = parts;
    const groupPath = groupId.replace(/\./g, '/');
    const fileName = `${artifactId}-${version}.jar`;
    const artifactPath = `${groupPath}/${artifactId}/${version}/${fileName}`;

    items.push({
      id: `fabric-lib-${name}`,
      path: path.join('libraries', artifactPath),
      url: `${url}${artifactPath}`,
      sha1,
      size,
      type: 'jar'
    });
  }

  const loader = fabricData.loader;
  const loaderMaven = loader.maven;
  const [loaderGroup, loaderArtifact, loaderVersion] = loaderMaven.split(':');
  const loaderPath = `${loaderGroup.replace(/\./g, '/')}/${loaderArtifact}/${loaderVersion}/${loaderArtifact}-${loaderVersion}.jar`;

  items.push({
    id: `fabric-loader-${loaderVersion}`,
    path: path.join('libraries', loaderPath),
    url: `${FABRIC_MAVEN_BASE}${loaderPath}`,
    sha1: null,
    size: 0,
    type: 'jar'
  });

  const intermediary = fabricData.intermediary;
  const intermMaven = intermediary.maven;
  const [intermGroup, intermArtifact, intermVersion] = intermMaven.split(':');
  const intermPath = `${intermGroup.replace(/\./g, '/')}/${intermArtifact}/${intermVersion}/${intermArtifact}-${intermVersion}.jar`;

  items.push({
    id: `fabric-intermediary-${intermVersion}`,
    path: path.join('libraries', intermPath),
    url: `${FABRIC_MAVEN_BASE}${intermPath}`,
    sha1: null,
    size: 0,
    type: 'jar'
  });

  return items;
}

/**
 * Build a merged version JSON that inherits from vanilla but uses Fabric's mainClass
 * and includes Fabric libraries in the libraries list.
 */
export function buildFabricVersionJson(fabricData, vanillaVersionJson) {
  const fabricVersionId = `${vanillaVersionJson.id}-fabric-${fabricData.loader.version}`;

  const merged = { ...vanillaVersionJson };

  merged.id = fabricVersionId;
  merged.inheritsFrom = vanillaVersionJson.id;
  merged.jar = vanillaVersionJson.id;

  const mainClass = fabricData.launcherMeta?.mainClass;
  merged.mainClass = mainClass?.client || mainClass?.server || 'net.fabricmc.loader.impl.launch.knot.KnotClient';

  const fabricLibs = buildFabricLibraryItems(fabricData);

  merged.libraries = [
    ...(vanillaVersionJson.libraries || []),
    ...fabricLibs.map(lib => {
      const parts = lib.path.split('/');
      const fileName = parts[parts.length - 1];
      const version = fileName.replace('.jar', '');
      return {
        name: version,
        downloads: {
          artifact: {
            path: lib.path,
            sha1: lib.sha1,
            size: lib.size,
            url: lib.url
          }
        }
      };
    })
  ];

  return merged;
}

export function getFabricMainClass(fabricData) {
  const mainClass = fabricData.launcherMeta?.mainClass;
  return mainClass?.client || mainClass?.server || 'net.fabricmc.loader.impl.launch.knot.KnotClient';
}

/**
 * Build the classpath entries for Fabric (common libs + loader + intermediary).
 * Note: Does NOT include vanilla Minecraft libraries - those are handled separately.
 */
export function getFabricClasspath(fabricData, _vanillaVersionJson) {
  const classpath = [];
  const libraries = fabricData.launcherMeta?.libraries?.common || [];

  for (const lib of libraries) {
    const name = lib.name;
    const parts = name.split(':');
    if (parts.length !== 3) continue;

    const [groupId, artifactId, version] = parts;
    const groupPath = groupId.replace(/\./g, '/');
    const fileName = `${artifactId}-${version}.jar`;
    const libPath = path.join(getMinecraftDir(), 'libraries', groupPath, artifactId, version, fileName);
    classpath.push(libPath);
  }

  const loader = fabricData.loader;
  const loaderMaven = loader.maven;
  const [loaderGroup, loaderArtifact, loaderVersion] = loaderMaven.split(':');
  const loaderPath = `${loaderGroup.replace(/\./g, '/')}/${loaderArtifact}/${loaderVersion}/${loaderArtifact}-${loaderVersion}.jar`;
  const fullLoaderPath = path.join(getMinecraftDir(), 'libraries', loaderPath);
  classpath.push(fullLoaderPath);

  return classpath;
}