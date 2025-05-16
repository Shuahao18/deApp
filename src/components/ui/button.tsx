import React from "react";
import { cn } from "@/lib/utils";
 // if you're using utility helpers

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost";
}

export const Button: React.FC<ButtonProps> = ({
  variant = "default",
  className = "",
  ...props
}) => {
  const baseStyle = "px-3 py-1 rounded font-medium";
  const variants = {
    default: "bg-blue-600 text-white hover:bg-blue-700",
    outline: "border border-gray-400 hover:bg-gray-100",
    ghost: "bg-transparent hover:bg-gray-200",
  };

  return (
    <button
      className={cn(baseStyle, variants[variant], className)}
      {...props}
    />
  );
};
