import React from 'react';

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();
  return (
    <footer className="w-full bg-star-white dark:bg-gray-800 text-immigo-gray-600 dark:text-immigo-gray-400 text-center py-3 text-sm border-t border-deep-navy dark:border-gray-700 mt-auto">
      &copy; {currentYear} ImmiGo. All rights reserved.
    </footer>
  );
};