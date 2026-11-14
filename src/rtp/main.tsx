import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import RtpApp from './RtpApp';
import '../yoga/yoga.css';
import './rtp.css';

const el = document.getElementById('root');
if (el) {
  createRoot(el).render(
    <StrictMode>
      <RtpApp />
    </StrictMode>,
  );
}
