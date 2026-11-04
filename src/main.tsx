import {createRoot} from 'react-dom/client';
import 'katex/dist/katex.min.css';
import App from './App.tsx';
import './index.css';
import './theme.css';

createRoot(document.getElementById('root')!).render(<App />);

