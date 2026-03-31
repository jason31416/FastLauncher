import path from 'path';
import { getMinecraftDir } from '../utils.js';
import { addItem } from './queue.js';
import { setLauncherType } from './index.js';
import { readVersionJsonCache, writeVersionJsonCache } from '../downloader.js';

const FABRIC_API_BASE = 'https://meta.fabricmc.net';
const FABRIC_MAVEN_BASE = 'https://maven.fabricmc.net/';

let _fabricData = null;

export async function download(versionSpec) {
  const [mcVersion, fabricVersion] = versionSpec.split(':');
  if (!mcVersion || !fabricVersion) {
    throw new Error(`Invalid fabric version spec: ${versionSpec}. Expected format: mcVersion:fabricVersion`);
  }
  _fabricData = await fetchFabricVersion(mcVersion, fabricVersion);
  buildAndQueueFabricDownloads(_fabricData);
  setLauncherType('fabric');
  return _fabricData;
}

async function fetchFabricVersion(mcVersion, fabricVersion) {
  const cacheKey = `fabric-${mcVersion}-${fabricVersion}`;
  const cached = await readVersionJsonCache(cacheKey);
  if (cached) return cached;

  const url = `${FABRIC_API_BASE}/v2/versions/loader/${mcVersion}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch Fabric versions for ${mcVersion}: ${response.status}`);
  }
  const versions = await response.json();
  let found;
  if (fabricVersion === 'latest') {
    found = versions.find(v => v.loader.stable === true) || versions[0];
  } else {
    found = versions.find(v => v.loader.version === fabricVersion);
  }
  if (!found) {
    throw new Error(`Fabric version ${fabricVersion} not found for Minecraft ${mcVersion}`);
  }
  await writeVersionJsonCache(cacheKey, found);
  return found;
}

function buildAndQueueFabricDownloads(fabricData) {
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
    addItem({
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
  addItem({
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
  addItem({
    id: `fabric-intermediary-${intermVersion}`,
    path: path.join('libraries', intermPath),
    url: `${FABRIC_MAVEN_BASE}${intermPath}`,
    sha1: null,
    size: 0,
    type: 'jar'
  });
}

export function getFabricData() {
  return _fabricData;
}

export function setFabricData(data) {
  _fabricData = data;
}

export function buildFabricVersionJson(fabricData, vanillaVersionJson) {
  const fabricVersionId = `${vanillaVersionJson.id}-fabric-${fabricData.loader.version}`;
  const merged = { ...vanillaVersionJson };
  merged.id = fabricVersionId;
  merged.inheritsFrom = vanillaVersionJson.id;
  merged.jar = vanillaVersionJson.id;
  const mainClass = fabricData.launcherMeta?.mainClass;
  merged.mainClass = mainClass?.client || mainClass?.server || 'net.fabricmc.loader.impl.launch.knot.KnotClient';
  return merged;
}
