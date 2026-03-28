import path from 'path';
import { getMinecraftDir } from './utils.js';

export const FABRIC_ENABLED = true;
export const FABRIC_MC_VERSION = '1.21.1';

const FABRIC_API_BASE = 'https://meta.fabricmc.net';
const FABRIC_MAVEN_BASE = 'https://maven.fabricmc.net/';

export async function getFabricVersions(mcVersion) {
  const url = `${FABRIC_API_BASE}/v2/versions/loader/${mcVersion}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch Fabric versions: ${response.status}`);
  }
  return response.json();
}

export async function getLatestFabricVersion(mcVersion) {
  const versions = await getFabricVersions(mcVersion);
  return versions.find(v => v.loader.stable === true) || versions[0];
}

export async function getFabricData(mcVersion) {
  const fabricVersion = await getLatestFabricVersion(mcVersion);
  return fabricVersion;
}

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

export function buildFabricVersionJson(fabricData, vanillaVersionJson) {
  const fabricVersionId = `${vanillaVersionJson.id}-fabric-${fabricData.loader.version}`;

  const merged = { ...vanillaVersionJson };

  merged.id = fabricVersionId;
  merged.inheritsFrom = vanillaVersionJson.id;
  merged.jar = vanillaVersionJson.id;

  const mainClass = fabricData.launcherMeta?.mainClass;
  merged.mainClass = mainClass?.client || mainClass?.server || 'net.fabricmc.loader.impl.launch.knot.KnotClient';

  const fabricLibs = buildFabricLibraryItems(fabricData);
  const fabricLibNames = new Set(fabricLibs.map(lib => {
    const parts = lib.path.split('/');
    const fileName = parts[parts.length - 1];
    return fileName.replace('.jar', '');
  }));

  merged.libraries = [
    ...(vanillaVersionJson.libraries || []),
    ...fabricLibs.map(lib => {
      const parts = lib.path.split('/');
      const fileName = parts[parts.length - 1];
      const version = fileName.replace('.jar', '');
      const nameParts = lib.id.replace('fabric-', '').split('-');
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

export function getFabricClasspath(fabricData, vanillaVersionJson) {
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