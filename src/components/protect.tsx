'use client';
import { useEffect } from 'react';

// Store page only: blocks the right-click menu and dragging/long-press saving of photos and videos.
// This deters casual copying; it can't stop someone determined (browsers always receive the page).
// Links and form fields keep their normal menu so shoppers can still open links, paste, etc.
// Not used on checkout, order or tracking pages, where customers need to copy bank details and order numbers.
export default function Protect() {
  useEffect(() => {
    const menu = (e: MouseEvent) => {
      const t = e.target as Element | null;
      const media = t?.closest('img, video, picture');
      if (!media && t?.closest('a[href], input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
    };
    const drag = (e: DragEvent) => {
      if ((e.target as Element | null)?.closest('img, video, picture, svg')) e.preventDefault();
    };
    document.addEventListener('contextmenu', menu);
    document.addEventListener('dragstart', drag);
    document.documentElement.classList.add('protect');
    return () => {
      document.removeEventListener('contextmenu', menu);
      document.removeEventListener('dragstart', drag);
      document.documentElement.classList.remove('protect');
    };
  }, []);
  return null;
}
