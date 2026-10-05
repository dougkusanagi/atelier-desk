import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import { AuthProvider } from './lib/auth';
import App from './App';
import './styles/global.css';
import { registerOfflineShell } from './lib/offline';
registerOfflineShell();
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { networkMode: 'always', retry: 1, staleTime: 15000, refetchOnWindowFocus: false },
  },
});
ReactDOM.createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <MotionConfig reducedMotion="user">
          <App />
        </MotionConfig>
      </AuthProvider>
    </BrowserRouter>
  </QueryClientProvider>,
);
