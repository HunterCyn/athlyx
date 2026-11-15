import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../rtp/base.css';
import './landing.css';
import Landing from './Landing';

const el = document.getElementById('root');
if (el) {
  createRoot(el).render(
    <StrictMode>
      <Landing />
    </StrictMode>,
  );
}
