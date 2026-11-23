import { ChakraProvider } from '@chakra-ui/react';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { system } from '@/theme/system';

/** Server-renders `element` inside the Metro system and returns the HTML. */
export function renderHtml(element: ReactElement): string {
  return renderToStaticMarkup(<ChakraProvider value={system}>{element}</ChakraProvider>);
}

/** The HTML with style tags removed, for asserting on content. */
export function renderMarkup(element: ReactElement): string {
  return renderHtml(element).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
}
