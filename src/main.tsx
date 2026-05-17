import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './styles.css';

const rootElement = document.getElementById('root');

window.addEventListener('error', (event) => {
  console.error('[VD_WINDOW_ERROR]', { error: event.error, message: event.message, filename: event.filename, lineno: event.lineno, colno: event.colno });
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[VD_UNHANDLED_REJECTION]', { reason: event.reason });
});

if (!rootElement) {
  console.error('[VD_BOOTSTRAP_ERROR]', { error: new Error('Root element #root was not found.') });
} else {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
