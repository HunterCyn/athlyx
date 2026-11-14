import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import YogaApp from './yoga/YogaApp';
import './yoga/yoga.css';

const el = document.getElementById('root');
if (el) {
  createRoot(el).render(
    <StrictMode>
      <YogaApp />
    </StrictMode>,
  );
}
