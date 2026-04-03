# IPC Specification for Version Selector

## Renderer → Main (invoke)

### `getInstalledVersions()`
Fetch list of all installed versions from disk.

**Returns:**
```json
{
  "success": true,
  "versions": [
    {
      "id": "1.21.4-fabric",
      "name": "Fabric 1.21.4",
      "installedAt": "2024-01-15T10:30:00Z"
    },
    {
      "id": "1.20.6-vanilla",
      "name": "Vanilla 1.20.6",
      "installedAt": "2024-01-10T08:00:00Z"
    }
  ]
}
```

**Errors:**
- `{ success: false, error: "No versions installed" }`
- `{ success: false, error: "Failed to read versions directory" }`

---

### `getVersionDetails(versionId)`
Fetch full details for a specific installed version.

**Parameters:** `versionId: string` (e.g., `"1.21.4-fabric"`)

**Returns:**
```json
{
  "success": true,
  "details": {
    "id": "1.21.4-fabric",
    "minecraftVersion": "1.21.4",
    "frameworks": ["fabric"],
    "mods": [
      { "id": "sodium", "name": "Sodium", "version": "0.10.0" },
      { "id": "lithium", "name": "Lithium", "version": "0.10.0" },
      { "id": "iris", "name": "Iris", "version": "1.0.0" },
      { "id": "indium", "name": "Indium", "version": "0.7.0" }
    ]
  }
}
```

**Errors:**
- `{ success: false, error: "Version not found" }`
- `{ success: false, error: "Failed to read version data" }`

---

## Implementation Notes

### Data Storage

**Installed versions list:**
- Stored in `userData/versions/` directory
- Each version has a folder named by its `id`
- Version metadata in `userData/versions/index.json`

**Version details:**
- Stored in `userData/versions/{versionId}/meta.json`

### Future IPCs (Not Implemented)

- `installVersion(manifest)` - Install new version from manifest
- `deleteVersion(versionId)` - Remove installed version
- `updateVersion(versionId, updates)` - Modify version configuration
