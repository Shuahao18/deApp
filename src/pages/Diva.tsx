import React from 'react';
import { Link } from 'react-router-dom';

const errorHandler = () => {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-gray-100">
      <h1 className="text-4xl font-bold text-gray-700 mb-4">404 - Page Not Found</h1>
      <Link
        to="/dashboard"
        className="text-blue-500 underline hover:text-blue-700"
      >
        Go to Dashboard
      </Link>
    </div>
  );
};

export default errorHandler;
