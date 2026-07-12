export const CLOUDFLARED_RELEASE = Object.freeze({
  version: "2026.7.1",
  repository: "cloudflare/cloudflared",
  source: "https://github.com/cloudflare/cloudflared/releases/tag/2026.7.1",
  assets: Object.freeze({
    "darwin-arm64": Object.freeze({
      file: "cloudflared-darwin-arm64.tgz",
      sha256: "a580c3cc8ae1c5f09d2bd5f870ef8699eadcb81af7db2d58ae488117d572c053",
      archive: true
    }),
    "darwin-x64": Object.freeze({
      file: "cloudflared-darwin-amd64.tgz",
      sha256: "117d5e0e8c2d4ae26b2a9ec428c3e2e719a1b7405a5734a977c7fd99a6089d12",
      archive: true
    }),
    "linux-arm64": Object.freeze({
      file: "cloudflared-linux-arm64",
      sha256: "18f2c9bfc7a67a971bd96f1a5a1935def3c1e52aa386626f1566f04e9b5478d6",
      archive: false
    }),
    "linux-arm": Object.freeze({
      file: "cloudflared-linux-arm",
      sha256: "17cedcb83d8239c5f81f6d57b7d50a384f0d57fd523af2763f47ac6cade77bf9",
      archive: false
    }),
    "linux-x64": Object.freeze({
      file: "cloudflared-linux-amd64",
      sha256: "79a0ade7fc854f62c1aaef48424d9d979e8c2fcd039189d24db82b84cd146be1",
      archive: false
    }),
    "linux-ia32": Object.freeze({
      file: "cloudflared-linux-386",
      sha256: "8452c2b93f2bfa89f1249bceaec128c90424e25a6ef600f57d92b1fbd0cb502f",
      archive: false
    }),
    "win32-x64": Object.freeze({
      file: "cloudflared-windows-amd64.exe",
      sha256: "ccb0756de288d3c2c076d19764ca53e0849a10f2dd9c23f8656ac42bdeb45001",
      archive: false
    }),
    "win32-ia32": Object.freeze({
      file: "cloudflared-windows-386.exe",
      sha256: "627fe6e42c5e92e42de962afec19bcbf14a60d43c352dbe4b605f1e3246462ed",
      archive: false
    })
  })
});

export function cloudflaredAsset(platform = process.platform, arch = process.arch) {
  const key = `${platform}-${arch}`;
  const asset = CLOUDFLARED_RELEASE.assets[key];
  if (!asset) {
    throw new Error(
      `Verified cloudflared installation is not supported on ${platform}/${arch}. ` +
      "Install cloudflared manually and pass its path to CodexPro."
    );
  }
  return asset;
}

export function cloudflaredReleaseUrl(asset) {
  return `https://github.com/${CLOUDFLARED_RELEASE.repository}/releases/download/${CLOUDFLARED_RELEASE.version}/${asset.file}`;
}
