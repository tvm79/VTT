/// <reference types="vite/client" />

import type * as React from 'react';

declare module '*.svg?react' {
  import React = require('react');
  export const ReactComponent: React.FC<React.SVGProps<SVGSVGElement>>;
  export default ReactComponent;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'toolcool-color-picker': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        color?: string;
        'popup-position'?: 'left' | 'right';
      };
    }
  }
}
