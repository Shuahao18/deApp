import { useState } from "react";

interface ProfileImageProps {
    src?: string | null;
    alt: string;
    className?: string;
    fallbackText?: string;
}

const ProfileImage = ({ 
    src, 
    alt, 
    className = "rounded-full w-10 h-10 object-cover",
    fallbackText 
}: ProfileImageProps) => {
    const [imgSrc, setImgSrc] = useState(src);
    const [hasError, setHasError] = useState(false);

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map(part => part.charAt(0))
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    const getRandomColor = (str: string) => {
        const colors = [
            'bg-blue-500', 'bg-green-500', 'bg-purple-500', 
            'bg-pink-500', 'bg-indigo-500', 'bg-teal-500',
            'bg-orange-500', 'bg-red-500', 'bg-cyan-500'
        ];
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    };

    if (hasError || !imgSrc) {
        const initials = getInitials(alt || "User");
        const colorClass = getRandomColor(alt || "User");
        
        return (
            <div className={`${className} ${colorClass} flex items-center justify-center text-white font-semibold text-sm`}>
                {initials}
            </div>
        );
    }

    return (
        <img
            src={imgSrc}
            alt={alt}
            className={className}
            onError={() => {
                setHasError(true);
                setImgSrc(null);
            }}
        />
    );
};

export default ProfileImage;