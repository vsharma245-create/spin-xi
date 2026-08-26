import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Google will not pay for an impression unless the site says, at its own root,
 * that this publisher is allowed to sell its inventory. That file has to carry
 * the publisher id, and a publisher id written down in two places is a publisher
 * id that will one day disagree with itself — so it is written from the same
 * environment variable the ad slots read, and only when there is one.
 *
 * https://iabtechlab.com/ads-txt/
 */
function adsTxt(client: string | undefined) {
  return {
    name: 'ads-txt',
    apply: 'build' as const,
    generateBundle(this: { emitFile: (f: { type: 'asset'; fileName: string; source: string }) => void }) {
      if (!client) return
      // "google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0" — the last
      // field is Google's own certification id and is the same for everyone.
      const id = client.replace(/^ca-/, '')
      this.emitFile({
        type: 'asset',
        fileName: 'ads.txt',
        source: `google.com, ${id}, DIRECT, f08c47fec0942fa0\n`,
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), adsTxt(env.VITE_ADSENSE_CLIENT)],
  }
})
