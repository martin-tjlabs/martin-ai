import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// playground 포트. PLAYGROUND_PORT로 바꾼다(예: PLAYGROUND_PORT=3000 pnpm dev).
// 서버도 같은 변수로 FLOW 로그인 콜백 주소를 만들므로, 루트에서 한 번만 지정하면 둘이 맞는다.
const port = Number(process.env.PLAYGROUND_PORT ?? 5180)

export default defineConfig({
  plugins: [react()],
  server: {
    // 같은 네트워크(와이파이)의 다른 기기에서도 http://<이 Mac의 IP>:<port>로 접속할 수 있게
    // 모든 네트워크 인터페이스에서 받는다. /api 프록시는 이 Mac에서 서버(8787)로 넘기므로 그대로 동작한다.
    host: true,
    port,
    // 포트가 사용 중일 때 다른 포트로 넘어가면 FLOW 로그인 콜백 주소와 어긋나므로, 대신 실행을 멈춘다
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
