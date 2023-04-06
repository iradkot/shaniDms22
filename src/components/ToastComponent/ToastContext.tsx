// ToastContext.js
import { createContext, useContext, useState } from 'react';

const ToastContext = createContext();

export const useToast = () => {
  return useContext(ToastContext);
};

export const ToastProvider = ({ children }) => {
  const [toast, setToast] = useState({ isVisible: false, message: '' });

  const showToast = (message) => {
    setToast({ isVisible: true, message });
  };

  const hideToast = () => {
    setToast({ isVisible: false, message: '' });
  };

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
  {children}
  </ToastContext.Provider>
);
};
