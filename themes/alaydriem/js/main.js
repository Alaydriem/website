'use strict';

import 'vite/modulepreload-polyfill';
import "../scss/main.scss";

class Alaydriem {
    constructor() {
        document.addEventListener('DOMContentLoaded', this.domReady.bind(this));
    }

    domReady() {
        console.log("Website loaded");        
    }
}

export default new Alaydriem();
