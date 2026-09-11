import { render, html } from './vendor/preact-htm-signals.js';
import { App } from './components/App.js';

render(html`<${App} />`, document.getElementById('app'));
