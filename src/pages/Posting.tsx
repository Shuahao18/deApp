import { useState, useEffect, useRef } from "react";
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, doc, runTransaction, increment, getDoc, deleteDoc, writeBatch, getDocs, updateDoc, setDoc
} from "firebase/firestore";
import { db, auth, storage } from "../Firebase";
import { onAuthStateChanged } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL, deleteObject, uploadBytesResumable,
} from "firebase/storage";
import { UserCircleIcon, ShareIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';

// 🌟 UPDATE: Added authorPhotoURL for author image stability 🌟
interface Post {
    id?: string;
    authorId: string;
    authorName: string;
    authorPhotoURL?: string | null;
    category: string;
    content: string;
    mediaUrl?: string;
    mediaType?: string;
    createdAt?: any;
    updatedAt?: any;
    commentsCount: number;
    reactsCount: number;
    pinned?: boolean;
}

// 🌟 UPDATE: Added photoURL for displaying comment author image 🌟
interface Comment {
    id?: string;
    userId: string;
    authorName?: string;
    user?: string;
    content?: string;
    text?: string;
    photoURL?: string | null;
    createdAt?: any;
}

interface ReactUser {
    id?: string;
    userId: string;
    authorName: string;
    photoURL?: string | null;
    createdAt?: any;
}

// -----------------------------------------------------------
// ProfileImage Component
// -----------------------------------------------------------

const ProfileImage = ({ 
    src, 
    alt, 
    className = "rounded-full w-10 h-10 object-cover",
    fallbackText 
}: { 
    src?: string | null; 
    alt: string; 
    className?: string;
    fallbackText?: string;
}) => {
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

// -----------------------------------------------------------
// Main App Component
// -----------------------------------------------------------

export default function App() {
    const [posts, setPosts] = useState<Post[]>([]);
    const [content, setContent] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("announcement");
    const [user, setUser] = useState<any>(null);
    const [isAdmin, setIsAdmin] = useState(false);

    const [fileToUpload, setFileToUpload] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [selectedFileName, setSelectedFileName] = useState("");
    const [uploadProgress, setUploadProgress] = useState(0);

    const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
    const [comments, setComments] = useState<Record<string, Comment[]>>({});
    const [newComment, setNewComment] = useState("");

    const [selectedReactPostId, setSelectedReactPostId] = useState<string | null>(
        null
    );
    const [reacts, setReacts] = useState<Record<string, ReactUser[]>>({});
    const [showReactsModal, setShowReactsModal] = useState(false);
    
    // 🌟 EDIT POST STATE 🌟
    const [isEditing, setIsEditing] = useState(false);
    const [editingPost, setEditingPost] = useState<Post | null>(null);
    const [editedContent, setEditedContent] = useState("");
    const [editedCategory, setEditedCategory] = useState("");

    // 🌟 USER REACTIONS STATE 🌟
    const [userReactions, setUserReactions] = useState<Record<string, boolean>>({});

    const fileInputRef = useRef<HTMLInputElement>(null);

    // 🌟 NEW: Navigation hook
    const navigate = useNavigate();

    // 🌟 NEW: Navigation handlers
    const handleAdminClick = () => {
        navigate('/EditModal');
    };

    const handleDashboardClick = () => {
        navigate('/Dashboard');
    };

    // 🌟 UPDATED: Improved getAuthorLabel for HOA Officials 🌟
    const getAuthorLabel = async (uid: string, fallback: string): Promise<{name: string, photoURL: string | null}> => {
        try {
            console.log("🔍 Fetching author label for UID:", uid);
            
            // 1. First try to get from 'admin' collection (main source for HOA Officials)
            const adminDoc = await getDoc(doc(db, "admin", uid));
            if (adminDoc.exists()) {
                const data = adminDoc.data();
                console.log("✅ Found in admin collection:", data);
                
                // Standardized field names for HOA Officials
                return {
                    name: data.displayName || data.name || data.role || fallback || "HOA Official",
                    photoURL: data.photoURL || data.avatar || data.imageUrl || null
                };
            }

            // 2. Try to get from 'users' collection as fallback
            const userDoc = await getDoc(doc(db, "users", uid));
            if (userDoc.exists()) {
                const data = userDoc.data();
                console.log("✅ Found in users collection:", data);
                return {
                    name: data.displayName || data.name || fallback || "HOA Official",
                    photoURL: data.photoURL || data.avatar || null
                };
            }

            // 3. Fallback - check current authenticated user
            console.log("⚠️ Not in collections, using auth data");
            const currentUser = auth.currentUser;
            if (currentUser && currentUser.uid === uid) {
                return {
                    name: currentUser.displayName || fallback || "HOA Official",
                    photoURL: currentUser.photoURL || null
                };
            }

            // 4. Ultimate fallback
            console.log("❌ No user data found for UID:", uid);
            return {
                name: fallback || "HOA Official",
                photoURL: null
            };

        } catch (e) {
            console.error("❌ Error fetching author label:", e);
            const currentUser = auth.currentUser;
            return {
                name: currentUser?.displayName || fallback || "HOA Official",
                photoURL: currentUser?.photoURL || null
            };
        }
    };

    const getFileType = (file: File): string => {
        if (file.type.startsWith("image/")) return "image";
        if (file.type.startsWith("video/")) return "video";
        if (file.type.startsWith("audio/")) return "audio";
        if (file.type === "application/pdf") return "pdf";
        if (
            file.type.includes("document") ||
            file.type.includes("text") ||
            file.type.includes("sheet") ||
            file.type.includes("presentation")
        )
            return "document";
        return "file";
    };

    const generateUniqueFileName = (file: File, userId: string): string => {
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(7);
        const fileExtension = file.name.split(".").pop();
        return `${userId}_${timestamp}_${randomString}.${fileExtension}`;
    };

    const compressImage = (file: File): Promise<File> => {
        return new Promise((resolve) => {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            const img = new Image();

            img.onload = () => {
                let { width, height } = img;
                const maxSize = 1200;

                if (width > height && width > maxSize) {
                    height = (height * maxSize) / width;
                    width = maxSize;
                } else if (height > maxSize) {
                    width = (width * maxSize) / height;
                    height = maxSize;
                }

                canvas.width = width;
                canvas.height = height;

                ctx?.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            const compressedFile = new File([blob], file.name, {
                                type: "image/jpeg",
                                lastModified: Date.now(),
                            });
                            resolve(compressedFile);
                        } else {
                            resolve(file);
                        }
                    },
                    "image/jpeg",
                    0.8
                );
            };

            img.src = URL.createObjectURL(file);
        });
    };

    const uploadFileToStorage = async (
        file: File
    ): Promise<{ url: string; type: string; filePath: string }> => {
        try {
            let fileToUpload = file;
            if (file.type.startsWith("image/") && file.size > 1024 * 1024) {
                fileToUpload = await compressImage(file);
            }

            const uniqueFileName = generateUniqueFileName(fileToUpload, user.uid);
            const fileType = getFileType(fileToUpload);
            const storagePath = `posts/${fileType}s/${uniqueFileName}`;
            const storageRef = ref(storage, storagePath);

            const uploadTask = uploadBytesResumable(storageRef, fileToUpload, {
                customMetadata: {
                    uploadedBy: user.uid,
                    originalName: file.name,
                    uploadTime: new Date().toISOString(),
                },
                cacheControl: "public,max-age=3600",
            });

            return new Promise((resolve, reject) => {
                uploadTask.on(
                    "state_changed",
                    (snapshot) => {
                        const progress =
                            (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        setUploadProgress(Math.round(progress * 0.8));
                    },
                    (error) => {
                        console.error("Upload error:", error);
                        reject(error);
                    },
                    async () => {
                        try {
                            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                            resolve({
                                url: downloadURL,
                                type: fileType,
                                filePath: storagePath,
                            });
                        } catch (error) {
                            reject(error);
                        }
                    }
                );
            });
        } catch (error) {
            console.error("Error uploading file to storage:", error);
            throw error;
        }
    };

    // --- useEffects ---

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            console.log("🔐 Auth state changed:", currentUser);
            setUser(currentUser);
            if (currentUser) {
                try {
                    console.log("👤 Checking admin status for:", currentUser.uid);
                    const adminDoc = await getDoc(doc(db, "admin", currentUser.uid));
                    console.log("🎯 Admin doc exists:", adminDoc.exists());
                    setIsAdmin(adminDoc.exists());
                    
                    // Test the getAuthorLabel function
                    const testAuthor = await getAuthorLabel(currentUser.uid, currentUser.displayName || "HOA Official");
                    console.log("🧪 Test getAuthorLabel result:", testAuthor);
                    
                } catch (error) {
                    console.error("Error checking admin status:", error);
                    setIsAdmin(false);
                }
            } else {
                setIsAdmin(false);
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
        const fetchedPosts = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        })) as Post[];
        
        console.log("📮 Fetched posts:", fetchedPosts);
        
        // 🌟 NEW: Sort posts - pinned posts first, then by creation date
        const sortedPosts = fetchedPosts.sort((a, b) => {
            // If both are pinned or both are not pinned, sort by createdAt
            if (a.pinned === b.pinned) {
                return b.createdAt?.toDate() - a.createdAt?.toDate();
            }
            // If a is pinned and b is not, a comes first
            if (a.pinned && !b.pinned) {
                return -1;
            }
            // If b is pinned and a is not, b comes first
            return 1;
        });
        
        setPosts(sortedPosts);

        // Check user reactions for all posts
        if (user) {
            const newUserReactions: Record<string, boolean> = {};
            
            for (const post of sortedPosts) {
                if (post.id) {
                    try {
                        const reactDoc = await getDoc(doc(db, "posts", post.id, "reacts", user.uid));
                        newUserReactions[post.id] = reactDoc.exists();
                    } catch (error) {
                        console.error(`Error checking reaction for post ${post.id}:`, error);
                        newUserReactions[post.id] = false;
                    }
                }
            }
            
            setUserReactions(newUserReactions);
        }
    });
    return () => unsubscribe();
}, [user]);

    useEffect(() => {
        if (!selectedReactPostId || !user) return;

        const q = query(
            collection(db, "posts", selectedReactPostId, "reacts"),
            orderBy("createdAt", "asc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedReacts = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            })) as ReactUser[];
            
            setReacts((prev) => ({ ...prev, [selectedReactPostId]: fetchedReacts }));
            
            // Check if current user has reacted to this post
            const hasReacted = fetchedReacts.some(react => react.userId === user.uid);
            setUserReactions(prev => ({
                ...prev,
                [selectedReactPostId]: hasReacted
            }));
        });

        return () => unsubscribe();
    }, [selectedReactPostId, user]);

    // --- Post/Comment Handlers ---

    const handleViewComments = (postId: string) => {
        if (selectedPostId === postId) {
            setSelectedPostId(null);
            return;
        }
        setSelectedPostId(postId);

        const q = query(
            collection(db, "posts", postId, "comments"),
            orderBy("createdAt", "asc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedComments = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            })) as Comment[];
            setComments((prev) => ({ ...prev, [postId]: fetchedComments }));
        });

        return () => unsubscribe();
    };

    // 🌟 UPDATED: handleAddComment without syncUserProfile 🌟
    const handleAddComment = async (postId: string) => {
        if (!newComment.trim()) return;
        if (!user) {
            alert("You must be logged in to comment.");
            return;
        }
        try {
            const postRef = doc(db, "posts", postId);
            await runTransaction(db, async (transaction) => {
                const authorInfo = await getAuthorLabel(user.uid, user.displayName || "HOA Official");
                await addDoc(collection(db, "posts", postId, "comments"), {
                    userId: user.uid,
                    authorName: authorInfo.name,
                    content: newComment,
                    photoURL: authorInfo.photoURL,
                    createdAt: serverTimestamp(),
                });
                transaction.update(postRef, {
                    commentsCount: increment(1),
                });
            });
            setNewComment("");
        } catch (err) {
            console.error("Error commenting:", err);
            alert("Failed to add comment. Check console.");
        }
    };

    // 🌟 UPDATED: handleToggleReact without syncUserProfile 🌟
    const handleToggleReact = async (postId: string) => {
        if (!user) {
            alert("You must be logged in to react.");
            return;
        }
        
        const postRef = doc(db, "posts", postId);
        const reactRef = doc(db, "posts", postId, "reacts", user.uid);
        try {
            await runTransaction(db, async (transaction) => {
                const reactDoc = await transaction.get(reactRef);
                if (reactDoc.exists()) {
                    transaction.delete(reactRef);
                    transaction.update(postRef, { reactsCount: increment(-1) });
                    // Update local state
                    setUserReactions(prev => ({
                        ...prev,
                        [postId]: false
                    }));
                } else {
                    const authorInfo = await getAuthorLabel(user.uid, user.displayName || "HOA Official");
                    transaction.set(reactRef, {
                        userId: user.uid,
                        authorName: authorInfo.name,
                        photoURL: authorInfo.photoURL,
                        createdAt: serverTimestamp(),
                    });
                    transaction.update(postRef, { reactsCount: increment(1) });
                    // Update local state
                    setUserReactions(prev => ({
                        ...prev,
                        [postId]: true
                    }));
                }
            });
        } catch (err) {
            console.error("Error toggling react:", err);
        }
    };
    
    // 🌟 UPDATED: handleCreatePost without syncUserProfile 🌟
    const handleCreatePost = async () => {
        if (!content.trim() && !fileToUpload) {
            alert("Please add content or attach a file.");
            return;
        }
        if (!user || !isAdmin) {
            alert("You do not have permission to create a post.");
            return;
        }

        setIsUploading(true);
        setUploadProgress(0);

        let mediaUrl = "";
        let mediaType = "";
        let mediaPath = "";

        try {
            if (fileToUpload) {
                setUploadProgress(5);
                const uploadResult = await uploadFileToStorage(fileToUpload);
                mediaUrl = uploadResult.url;
                mediaType = uploadResult.type;
                mediaPath = uploadResult.filePath;
                setUploadProgress(85);
            }

            const authorInfo = await getAuthorLabel(user.uid, user.displayName || "HOA Official");
            setUploadProgress(90);

            console.log("📝 Creating post with author info:", authorInfo);

            await addDoc(collection(db, "posts"), {
                userId: user.uid,
                authorId: user.uid,
                authorName: authorInfo.name,
                authorPhotoURL: authorInfo.photoURL,
                category: selectedCategory,
                content: content.trim(),
                commentsCount: 0,
                reactsCount: 0,
                pinned: false,
                mediaUrl: mediaUrl || null,
                mediaType: mediaType || null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });

            setUploadProgress(100);
            handleCancelPost();
        } catch (err) {
            console.error("Error creating post:", err);
            if (fileToUpload && mediaPath) {
                try {
                    await deleteObject(ref(storage, mediaPath));
                    console.log("Successfully cleaned up orphaned file.");
                } catch (cleanupErr) {
                    console.error("Failed to clean up orphaned file:", cleanupErr);
                }
            }
            alert("Failed to create post. Please try again.");
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
        }
    };

    const handleCancelPost = () => {
        setContent("");
        setSelectedCategory("announcement");
        setFileToUpload(null);
        setSelectedFileName("");
        setUploadProgress(0);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handlePinPost = async (postId: string, currentPinStatus: boolean) => {
        if (!user || !isAdmin) {
            alert("Only an admin can pin or unpin a post.");
            return;
        }

        const newPinStatus = !currentPinStatus;
        const action = newPinStatus ? "pin" : "unpin";

        if (!window.confirm(`Are you sure you want to ${action} this post?`)) {
            return;
        }

        try {
            const postRef = doc(db, "posts", postId);
            await runTransaction(db, async (transaction) => {
                const postDoc = await transaction.get(postRef);
                if (!postDoc.exists()) {
                    throw "Post does not exist!";
                }

                transaction.update(postRef, {
                    pinned: newPinStatus,
                    updatedAt: serverTimestamp(),
                });
            });
            console.log(`Post ${postId} successfully ${action}ned.`);
        } catch (err) {
            console.error(`Error ${action}ning post:`, err);
            alert(`Failed to ${action} post. Please try again.`);
        }
    };
    
    const openEditModal = (post: Post) => {
        if (!user || (!isAdmin && user.uid !== post.authorId)) {
            alert("You do not have permission to edit this post.");
            return;
        }
        setEditingPost(post);
        setEditedContent(post.content);
        setEditedCategory(post.category);
        setIsEditing(true);
    };

    const handleEditPost = async () => {
        if (!editingPost) return;
        if (!editedContent.trim()) {
            alert("Post content cannot be empty.");
            return;
        }

        try {
            const postRef = doc(db, "posts", editingPost.id!);

            await runTransaction(db, async (transaction) => {
                const postDoc = await transaction.get(postRef);
                if (!postDoc.exists()) {
                    throw "Post does not exist!";
                }

                transaction.update(postRef, {
                    content: editedContent.trim(),
                    category: editedCategory,
                    updatedAt: serverTimestamp(),
                });
            });

            alert("Post updated successfully!");
            setIsEditing(false);
            setEditingPost(null);
        } catch (err) {
            console.error("Error editing post:", err);
            alert("Failed to edit post. Please try again.");
        }
    };

    const handleDeletePost = async (post: Post) => {
        if (!user) {
            alert("You must be logged in to delete a post.");
            return;
        }

        const isAuthor = user.uid === post.authorId;
        if (!isAuthor && !isAdmin) {
            alert("You do not have permission to delete this post.");
            return;
        }

        if (window.confirm("Are you sure you want to delete this post? This action cannot be undone.")) {
            try {
                const batch = writeBatch(db);
                const postRef = doc(db, "posts", post.id!);

                const commentsSnapshot = await getDocs(collection(postRef, "comments"));
                commentsSnapshot.forEach((commentDoc) => {
                    batch.delete(commentDoc.ref);
                });

                const reactsSnapshot = await getDocs(collection(postRef, "reacts"));
                reactsSnapshot.forEach((reactDoc) => {
                    batch.delete(reactDoc.ref);
                });
                
                batch.delete(postRef);
                await batch.commit();

                if (post.mediaUrl) {
                    try {
                        const fileRef = ref(storage, post.mediaUrl);
                        await deleteObject(fileRef);
                    } catch (storageError) {
                        console.warn("Failed to delete file from storage. It may not exist.", storageError);
                    }
                }

                console.log("Post and all associated data deleted successfully.");
            } catch (err) {
                console.error("Error deleting post:", err);
                alert("Failed to delete post. Please check the console for details.");
            }
        }
    };

    // --- UI/Helper Functions ---

    const openReactsModal = (postId: string) => {
        setSelectedReactPostId(postId);
        setShowReactsModal(true);
    };

    const closeReactsModal = () => {
        setSelectedReactPostId(null);
        setShowReactsModal(false);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const maxSize = 20 * 1024 * 1024;
            if (file.size > maxSize) {
                alert("File size must be less than 20MB");
                return;
            }

            const allowedTypes = [
                "image/jpeg", "image/png", "image/gif", "image/webp",
                "video/mp4", "video/webm", "video/ogg",
                "audio/mp3", "audio/wav", "audio/ogg",
                "application/pdf",
                "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "text/plain",
            ];
            if (!allowedTypes.includes(file.type)) {
                alert(
                    "File type not supported. Please upload images, videos, audio, PDF, or document files."
                );
                return;
            }
            const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
            setFileToUpload(file);
            setSelectedFileName(`${file.name} (${fileSizeMB} MB)`);
        } else {
            setFileToUpload(null);
            setSelectedFileName("");
        }
    };

    const getRelativeTime = (timestamp: any) => {
        if (!timestamp?.toDate) return "";
        const seconds = Math.floor((new Date().getTime() - timestamp.toDate().getTime()) / 1000);
        let interval = seconds / 31536000;
        if (interval > 1) return `${Math.floor(interval)}y ago`;
        interval = seconds / 2592000;
        if (interval > 1) return `${Math.floor(interval)}mo ago`;
        interval = seconds / 86400;
        if (interval > 1) return `${Math.floor(interval)}d ago`;
        interval = seconds / 3600;
        if (interval > 1) return `${Math.floor(interval)}h ago`;
        interval = seconds / 60;
        if (interval > 1) return `${Math.floor(interval)}m ago`;
        return `${Math.floor(seconds)}s ago`;
    };
    
    const renderMediaContent = (post: Post) => {
        if (!post.mediaUrl) {
            return null;
        }

        const mediaType = post.mediaType || "file";
        const defaultImageUrl = "https://via.placeholder.com/500x300.png?text=File+Preview";

        switch (mediaType) {
            case "image":
                return (
                    <img
                        src={post.mediaUrl}
                        alt="Post Media"
                        className="mt-4 rounded-lg w-full max-h-[500px] object-contain cursor-pointer"
                        onClick={() => window.open(post.mediaUrl, "_blank")}
                    />
                );
            case "video":
                return (
                    <video
                        src={post.mediaUrl}
                        controls
                        className="mt-4 rounded-lg w-full max-h-[500px]"
                    />
                );
            case "audio":
                return <audio src={post.mediaUrl} controls className="mt-4 w-full" />;
            case "pdf":
            case "document":
            case "file":
                return (
                    <div className="mt-4 p-4 border rounded-lg bg-gray-50 flex items-center justify-between">
                        <a
                            href={post.mediaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-blue-600 hover:underline"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={1.5}
                                stroke="currentColor"
                                className="w-6 h-6"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M19.5 14.25v-2.25H15a3 3 0 0 0-3-3m0 0a3 3 0 0 0-3 3m3-3a3 3 0 0 1 3 3m-3-3V1.5m6 0h.008v.008h-.008ZM12 6.538V12m6 1.838a6 6 0 1 0-11.996.386m-6 3.65a6 6 0 1 0 11.996-.386"
                                />
                            </svg>
                            <span>View file: {post.mediaType}</span>
                        </a>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col">
            {/* 🌟 NEW: TOP HEADER - HOA Officials Header */}
            <header className="w-full bg-[#1e4643] text-white shadow-lg p-3 px-6 flex justify-between items-center flex-shrink-0">
                
                {/* HOA Officials Title - Left Side */}
                <div className="flex items-center space-x-4">
                    <h1 className="text-sm font-Montserrat font-extrabold text-yel ">Posting</h1>
                </div>

                {/* Empty Center for Balance */}
                <div className="flex-1"></div>

                {/* Profile/User Icon on the Right */}
                <div className="flex items-center space-x-3">
                    <button className="p-2 rounded-full hover:bg-white/20 transition-colors">
                        <ShareIcon className="h-5 w-5" /> 
                    </button>

                    {/* ADMIN BUTTON: Navigation Handler */}
                    <div 
                        className="flex items-center space-x-2 cursor-pointer hover:bg-white/20 p-1 pr-2 rounded-full transition-colors"
                        onClick={handleAdminClick} 
                    >
                        <UserCircleIcon className="h-8 w-8 text-white" />
                        <span className="text-sm font-medium hidden sm:inline">Admin</span>
                    </div>
                </div>
            </header>

            {/* MAIN CONTENT */}
            <div className="flex-1 overflow-auto">
                <div className="flex flex-col lg:flex-row m-8 gap-6 bg-gray-100 min-h-screen">
                    {/* Left Column - Posts */}
                    <div className="flex flex-col w-full lg:w-2/3">
                        {posts.length === 0 && (
                            <div className="text-gray-500 text-center mt-8">No posts yet</div>
                        )}

                        {posts.map((post) => (
                            <div key={post.id} className="bg-white p-4 rounded shadow mb-4">
                                {/* Post Header */}
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <ProfileImage
                                            src={post.authorPhotoURL}
                                            alt={post.authorName}
                                            className="rounded-full w-10 h-10 object-cover"
                                            fallbackText={post.authorName}
                                        />
                                        <div className="flex flex-col">
                                            <p className="font-semibold text-gray-800">
                                                {post.authorName}
                                                {post.pinned && (
                                                    <span className="ml-2 px-2 py-0.5 text-xs font-medium text-blue-800 bg-blue-100 rounded-full">
                                                        PINNED
                                                    </span>
                                                )}
                                            </p>
                                            <span className="text-xs text-gray-500">
                                                {getRelativeTime(post.createdAt)}
                                            </span>
                                        </div>
                                    </div>
                                    <span className="text-sm text-gray-500 capitalize px-2 py-1 bg-gray-200 rounded">
                                        {post.category}
                                    </span>
                                </div>

                                {/* Post Content */}
                                <p className="mt-5 text-gray-700 font-mono text-sm whitespace-pre-line">
                                    {post.content}
                                </p>

                                {/* Render media content based on type */}
                                {renderMediaContent(post)}

                                {/* Reactions and Comments Count */}
                                <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                                    <div className="flex items-center gap-1 cursor-pointer hover:underline" onClick={() => openReactsModal(post.id!)}>
                                        <span>{post.reactsCount}</span>
                                        <span>Reacts</span>
                                    </div>
                                    <div className="flex items-center gap-1 cursor-pointer hover:underline" onClick={() => handleViewComments(post.id!)}>
                                        <span>{post.commentsCount}</span>
                                        <span>Comment</span>
                                    </div>
                                </div>

                                {/* Post Actions - IMPROVED BUTTONS */}
                                <div className="flex gap-1 mt-2 border-t pt-3 justify-around">
                                    {/* IMPROVED React Button with HIGHLIGHT when liked */}
                                    <button
                                        className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-lg transition-all duration-200 border ${
                                            userReactions[post.id!] 
                                                ? 'bg-blue-100 border-blue-300 text-blue-700' 
                                                : 'border-transparent hover:border-blue-200 hover:bg-blue-50 text-blue-600'
                                        }`}
                                        onClick={() => handleToggleReact(post.id!)}
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            viewBox="0 0 24 24"
                                            fill={userReactions[post.id!] ? "currentColor" : "none"}
                                            stroke="currentColor"
                                            strokeWidth={userReactions[post.id!] ? 0 : 1.5}
                                            className={`w-5 h-5 ${userReactions[post.id!] ? 'text-blue-600' : 'text-[#464646]'}`}
                                        >
                                            <path d="M7.493 18.75c-.425 0-.82-.236-.975-.632A7.48 7.48 0 016 15.375c0-1.75.599-3.358 1.602-4.634.151-.192.373-.309.6-.397.473-.183.89-.514 1.212-.924a9.042 9.042 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75 2.25 2.25 0 012.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H14.23c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23h-.777zM2.331 10.977a11.969 11.969 0 00-.831 4.398 12 12 0 00.52 3.507c.26.85 1.084 1.368 1.973 1.368H4.9c.445 0 .72-.498.523-.898a8.963 8.963 0 01-.924-3.977c0-1.708.476-3.305 1.302-4.666.245-.403-.028-.959-.5-.959H4.25c-.832 0-1.612.453-1.918 1.227z" />
                                        </svg>
                                        <span className={`text-sm font-medium ${userReactions[post.id!] ? 'text-blue-700' : 'text-[#919596]'}`}>
                                            {userReactions[post.id!] ? 'Liked' : 'Like'}
                                        </span>
                                    </button>

                                    {/* IMPROVED Comment Button */}
                                    <button
                                        className="flex-1 flex items-center justify-center gap-2 p-2 rounded-lg hover:bg-green-50 transition-all duration-200 border border-transparent hover:border-green-200"
                                        onClick={() => handleViewComments(post.id!)}
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                            className="w-5 h-5 text-[#464646]"
                                        >
                                            <path
                                                fillRule="evenodd"
                                                d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97z"
                                                clipRule="evenodd"
                                            />
                                        </svg>
                                        <span className="text-sm font-medium text-[#919596]">Comment</span>
                                    </button>

                                    {/* Pin Post Button (Admin Only) */}
                                    {isAdmin && (
                                        <button
                                            className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-lg transition-all duration-200 border ${
                                                post.pinned 
                                                    ? 'bg-blue-500 text-white hover:bg-blue-600 border-blue-500' 
                                                    : 'hover:bg-gray-50 border-transparent hover:border-gray-200 text-gray-700'
                                            }`}
                                            onClick={() => handlePinPost(post.id!, post.pinned || false)}
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                fill={post.pinned ? "currentColor" : "none"}
                                                viewBox="0 0 24 24"
                                                strokeWidth={1.5}
                                                stroke={post.pinned ? "none" : "currentColor"}
                                                className="w-5 h-5"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.514 48.514 0 0 1 11.186 0Z"
                                                />
                                            </svg>
                                            <span className={`text-sm font-medium ${post.pinned ? 'text-white' : 'text-gray-700'}`}>
                                                {post.pinned ? "Unpin" : "Pin"}
                                            </span>
                                        </button>
                                    )}
                                    
                                    {/* Edit and Delete Buttons (Admin or Author Only) */}
                                    {(isAdmin || user?.uid === post.authorId) && (
                                        <>
                                            {/* Edit Post Button */}
                                            <button
                                                className="flex-1 flex items-center justify-center gap-2 p-2 rounded-lg hover:bg-yellow-50 transition-all duration-200 border border-transparent hover:border-yellow-200"
                                                onClick={() => openEditModal(post)}
                                            >
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    viewBox="0 0 24 24"
                                                    fill="currentColor"
                                                    className="w-5 h-5 text-[#464646]"
                                                >
                                                    <path
                                                        fillRule="evenodd"
                                                        d="M12 6.75a5.25 5.25 0 016.775-5.025.75.75 0 01.313 1.248l-3.32 3.319c.063.475.276.934.641 1.299.365.365.824.578 1.3.64l3.318-3.319a.75.75 0 011.248.313 5.25 5.25 0 01-5.472 6.756c-1.018-.086-1.87.1-2.309.634L7.344 21.3A3.298 3.298 0 112.7 16.657l8.684-7.151c.533-.44.72-1.291.634-2.309A5.342 5.342 0 0112 6.75zM4.117 19.125a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75h-.008a.75.75 0 01-.75-.75v-.008z"
                                                        clipRule="evenodd"
                                                    />
                                                </svg>
                                                <span className="text-sm font-medium text-[#919596]">Edit</span>
                                            </button>
                                            <button
                                                className="flex-1 flex items-center justify-center gap-2 p-2 rounded-lg hover:bg-red-50 transition-all duration-200 border border-transparent hover:border-red-200"
                                                onClick={() => handleDeletePost(post)}
                                            >
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    viewBox="0 0 24 24"
                                                    fill="currentColor"
                                                    className="w-5 h-5 text-[#464646]"
                                                >
                                                    <path
                                                        fillRule="evenodd"
                                                        d="M16.5 4.478v.227a48.816 48.816 0 013.878.512.75.75 0 11-.256 1.478l-.209-.035-1.005 13.07a3 3 0 01-2.991 2.77H8.084a3 3 0 01-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 01-.256-1.478A48.567 48.567 0 017.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 013.369 0c1.603.051 2.815 1.387 2.815 2.951zm-6.136-1.452a51.196 51.196 0 013.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 00-6 0v-.113c0-.794.609-1.428 1.364-1.452zm-.355 5.945a.75.75 0 10-1.5.058l.347 9a.75.75 0 101.499-.058l-.346-9zm5.48.058a.75.75 0 10-1.498-.058l-.347 9a.75.75 0 001.5.058l.345-9z"
                                                        clipRule="evenodd"
                                                    />
                                                </svg>
                                                <span className="text-sm font-medium text-[#919596]">Delete</span>
                                            </button>
                                        </>
                                    )}
                                </div>

                                {/* IMPROVED Comments Section */}
                                {selectedPostId === post.id && (
                                    <div className="mt-3 border-t pt-3">
                                        <h4 className="font-semibold mb-2 text-gray-800">Comments</h4>

                                        {comments[post.id!]?.length ? (
                                            <div className="space-y-3 max-h-80 overflow-y-auto">
                                                {comments[post.id!].map((c) => (
                                                    <div key={c.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                                        <ProfileImage
                                                            src={c.photoURL}
                                                            alt={c.authorName || "Commenter"}
                                                            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                                                            fallbackText={c.authorName}
                                                        />
                                                        <div className="flex-1 min-w-0">
                                                            {/* Name at the top */}
                                                            <div className="flex items-center justify-between mb-1">
                                                                <span className="font-semibold text-gray-800 text-sm">
                                                                    {c.authorName || c.user}
                                                                </span>
                                                                <span className="text-xs text-gray-400">
                                                                    {c.createdAt?.toDate
                                                                        ? getRelativeTime(c.createdAt)
                                                                        : ""}
                                                                </span>
                                                            </div>
                                                            {/* Comment content below */}
                                                            <p className="text-sm text-gray-700 break-words">
                                                                {c.content || c.text}
                                                            </p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-gray-500 text-center py-4">No comments yet</p>
                                        )}

                                        <div className="flex gap-2 mt-3">
                                            <input
                                                type="text"
                                                placeholder="Write a comment..."
                                                value={newComment}
                                                onChange={(e) => setNewComment(e.target.value)}
                                                className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all duration-200"
                                                onKeyPress={(e) => {
                                                    if (e.key === 'Enter') {
                                                        handleAddComment(post.id!);
                                                    }
                                                }}
                                            />
                                            <button
                                                onClick={() => handleAddComment(post.id!)}
                                                className="bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium"
                                                disabled={!newComment.trim() || !user}
                                            >
                                                Post
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Right Column - Create Post */}
                    {isAdmin && (
                        <div className="w-full lg:w-1/3 bg-white rounded-lg shadow-lg h-fit border border-gray-200">
                            {/* 🔹 Black Header */}
                            <div className="bg-[#1e4643] text-white px-6 py-4 rounded-t-lg">
                                <h2 className="text-lg font-semibold">Create post</h2>
                            </div>
                            
                            <div className="p-4">
                                <div className="flex items-center gap-3 mb-4">
                                   
                                    
                                    <div className="flex items-center gap-2 ml-auto">
                                        <select
                                            value={selectedCategory}
                                            onChange={(e) => setSelectedCategory(e.target.value)}
                                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        >
                                            <option value="announcement">Announcement</option>
                                            <option value="complaint">Complaint</option>
                                            <option value="general">General</option>
                                        </select>
                                        <label className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-700 hover:bg-gray-200 cursor-pointer transition-all duration-200 border border-gray-300">
                                            <span className="text-lg">📎</span>
                                            <span>Attach Files</span>
                                            <input
                                                type="file"
                                                className="hidden"
                                                onChange={handleFileChange}
                                                ref={fileInputRef}
                                                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                                            />
                                        </label>
                                    </div>
                                </div>

                                {selectedFileName && (
                                    <div className="text-sm text-gray-600 mb-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <strong>Selected file:</strong> {selectedFileName}
                                            </div>
                                            <button
                                                onClick={() => {
                                                    setFileToUpload(null);
                                                    setSelectedFileName("");
                                                    if (fileInputRef.current) fileInputRef.current.value = '';
                                                }}
                                                className="text-red-600 hover:text-red-800 transition-colors duration-200"
                                            >
                                                ✕ Remove
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {isUploading && uploadProgress > 0 && (
                                    <div className="mb-4">
                                        <div className="flex justify-between text-sm text-gray-600 mb-1">
                                            <span>Uploading...</span>
                                            <span>{uploadProgress}%</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                            <div
                                                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                                style={{ width: `${uploadProgress}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                )}

                                <textarea
                                    placeholder="Type a post"
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    className="w-full p-4 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 placeholder-gray-400 transition-all duration-200"
                                    rows={6}
                                    disabled={isUploading}
                                />

                                <div className="flex justify-end gap-2 mt-4 border-t pt-4">
                                    <button
                                        className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 transition-all duration-200 font-medium"
                                        onClick={handleCancelPost}
                                        disabled={isUploading}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleCreatePost}
                                        disabled={isUploading || (!content.trim() && !fileToUpload)}
                                        className={`px-6 py-2 rounded-lg font-medium transition-all duration-200 ${
                                            isUploading || (!content.trim() && !fileToUpload)
                                                ? "bg-green-300 cursor-not-allowed text-white"
                                                : "bg-green-600 hover:bg-green-700 text-white"
                                        }`}
                                    >
                                        {isUploading ? "Uploading..." : "Upload"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Reacts Modal */}
                    {showReactsModal && (
                        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                            <div className="bg-white rounded-lg shadow-lg w-full max-w-sm mx-4 p-4">
                                <div className="flex justify-between items-center border-b pb-2 mb-4">
                                    <h3 className="font-bold text-lg">Reacts</h3>
                                    <button
                                        onClick={closeReactsModal}
                                        className="text-gray-500 hover:text-gray-700 text-2xl transition-colors duration-200"
                                    >
                                        &times;
                                    </button>
                                </div>

                                {reacts[selectedReactPostId!]?.length > 0 ? (
                                    <div className="max-h-80 overflow-y-auto">
                                        {reacts[selectedReactPostId!]?.map((r) => (
                                            <div
                                                key={r.id}
                                                className="flex items-center gap-3 p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200"
                                            >
                                                <ProfileImage
                                                    src={r.photoURL}
                                                    alt={r.authorName}
                                                    className="rounded-full w-8 h-8 object-cover"
                                                    fallbackText={r.authorName}
                                                />
                                                <p className="font-semibold text-gray-800">
                                                    {r.authorName || "HOA Official"}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-gray-500 text-center py-4">No reacts yet.</p>
                                )}
                            </div>
                        </div>
                    )}
                    
                    {/* Edit Post Modal */}
                    {isEditing && editingPost && (
                        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                            <div className="bg-white rounded-lg shadow-lg w-full max-w-md mx-4 p-6">
                                <h3 className="font-bold text-xl mb-4 border-b pb-2">Edit Post</h3>
                                
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                                    <select
                                        value={editedCategory}
                                        onChange={(e) => setEditedCategory(e.target.value)}
                                        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                        <option value="announcement">Announcement</option>
                                        <option value="complaint">Complaint</option>
                                        <option value="general">General</option>
                                    </select>
                                </div>

                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                                    <textarea
                                        value={editedContent}
                                        onChange={(e) => setEditedContent(e.target.value)}
                                        className="w-full p-3 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                                        rows={8}
                                    />
                                </div>

                                <div className="flex justify-end gap-3">
                                    <button
                                        onClick={() => {
                                            setIsEditing(false);
                                            setEditingPost(null);
                                        }}
                                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all duration-200 font-medium"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleEditPost}
                                        disabled={!editedContent.trim()}
                                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-all duration-200 font-medium"
                                    >
                                        Save Changes
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}