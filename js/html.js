import { h, render, Fragment } from 'preact';
import htm from 'htm';
export { useState, useEffect, useMemo, useRef, useCallback } from 'preact/hooks';

export const html = htm.bind(h);
export { h, render, Fragment };
