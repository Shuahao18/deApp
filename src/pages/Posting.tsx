import { useState, useEffect } from "react";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  doc,
  runTransaction,
  increment,
  getDoc,
} from "firebase/firestore";
import { db, auth, storage } from "../Firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  uploadBytesResumable,
} from "firebase/storage";

interface Post {
  id?: string;
  authorId: string;
  authorName: string;
  category: string;
  content: string;
  imageUrl?: string;
  mediaUrl?: string;
  mediaType?: string;
  createdAt?: any;
  updatedAt?: any;
  commentsCount: number;
  reactsCount: number;
  pinned?: boolean;
}

interface Comment {
  id?: string;
  userId: string;
  authorName?: string;
  user?: string;
  content?: string;
  text?: string;
  createdAt?: any;
}

interface ReactUser {
  id?: string;
  userId: string;
  authorName: string;
  createdAt?: any;
}

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

  // -----------------------------------------------------------
  // Helper Functions
  // -----------------------------------------------------------

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

  const getAuthorLabel = async (uid: string, fallback: string) => {
    try {
      const adminDoc = await getDoc(doc(db, "admin", uid));
      if (adminDoc.exists()) {
        return adminDoc.data().accountRole || "admin";
      }
      return fallback || "HOA Member";
    } catch (e) {
      console.error("Error fetching author label:", e);
      return fallback || "HOA Member";
    }
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

  // -----------------------------------------------------------
  // useEffect Hooks
  // -----------------------------------------------------------

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const adminDoc = await getDoc(doc(db, "admin", currentUser.uid));
          setIsAdmin(adminDoc.exists());
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
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedPosts = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Post[];
      setPosts(fetchedPosts);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!selectedReactPostId) return;

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
    });

    return () => unsubscribe();
  }, [selectedReactPostId]);

  // -----------------------------------------------------------
  // Event Handlers
  // -----------------------------------------------------------

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

  const handleAddComment = async (postId: string) => {
    if (!newComment.trim()) return;
    if (!user) {
      alert("You must be logged in to comment.");
      return;
    }
    try {
      const postRef = doc(db, "posts", postId);
      await runTransaction(db, async (transaction) => {
        const authorName = await getAuthorLabel(user.uid, user.displayName);
        await addDoc(collection(db, "posts", postId, "comments"), {
          userId: user.uid,
          authorName,
          content: newComment,
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
        } else {
          const authorName = await getAuthorLabel(user.uid, user.displayName);
          transaction.set(reactRef, {
            userId: user.uid,
            authorName,
            createdAt: serverTimestamp(),
          });
          transaction.update(postRef, { reactsCount: increment(1) });
        }
      });
    } catch (err) {
      console.error("Error toggling react:", err);
    }
  };

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
      const maxSize = 20 * 1024 * 1024; // 20MB
      if (file.size > maxSize) {
        alert("File size must be less than 20MB");
        return;
      }

      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "video/mp4",
        "video/webm",
        "video/ogg",
        "audio/mp3",
        "audio/wav",
        "audio/ogg",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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

  const handleCreatePost = async () => {
    if (!content.trim() && !fileToUpload) {
      alert("Please add content or attach a file.");
      return;
    }
    if (!user) {
      alert("You must be logged in to post.");
      return;
    }
    if (!isAdmin) {
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

      const authorLabel = await getAuthorLabel(user.uid, user.displayName);
      setUploadProgress(90);

      await addDoc(collection(db, "posts"), {
        userId: user.uid,
        authorId: user.uid,
        authorName: authorLabel,
        category: selectedCategory,
        content: content.trim(),
        imageUrl: user.photoURL || "",
        commentsCount: 0,
        reactsCount: 0,
        pinned: false,
        mediaUrl: mediaUrl || null,
        mediaType: mediaType || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setUploadProgress(100);
      setContent("");
      setSelectedCategory("announcement");
      setFileToUpload(null);
      setSelectedFileName("");
    } catch (err) {
      console.error("Error creating post:", err);
      if (fileToUpload && mediaPath) {
        try {
          // Attempt to delete the file from storage if post creation fails
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
  };

  // -----------------------------------------------------------
  // Render Functions
  // -----------------------------------------------------------

  // Function to render media content (image, video, etc.)
  const renderMediaContent = (post: Post) => {
    if (!post.mediaUrl) {
      return null;
    }

    const mediaType = post.mediaType || "file";

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
        return (
          <audio src={post.mediaUrl} controls className="mt-4 w-full" />
        );
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
                  d="M19.5 14.25v-2.25H15a3 3 0 0 0-3-3m0 0a3 3 0 0 0-3 3m3-3a3 3 0 0 1 3 3m-3-3V1.5m6 0h.008v.008h-.008ZM12 6.538V12m6 1.838a6 6 0 1 0-11.996.386m-6 3.65a6 6 0 1 0 11.996-.386M21 21v-3.75a3 3 0 0 0-3-3m-3 3H5.25m3.75 0V7.5a3 3 0 0 1 3-3m-3-3a3 3 0 0 1 3 3m-3-3V1.5m6 0h.008v.008h-.008ZM12 6.538V12m6 1.838a6 6 0 1 0-11.996.386M12 6.538V12"
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
    <div className="flex flex-col lg:flex-row gap-6 bg-gray-100 min-h-screen p-6">
      {/* Left Column - Posts */}
      <div className="flex flex-col w-full lg:w-2/3">
        <h1 className="text-2xl font-bold text-green-800 mb-4">All Entries</h1>

        {posts.length === 0 && (
          <div className="text-gray-500 text-center mt-8">No posts yet</div>
        )}

        {posts.map((post) => (
          <div key={post.id} className="bg-white p-4 rounded shadow mb-4">
            {/* Post Header */}
            <div className="flex justify-between">
              <div className="flex items-center gap-3">
                <img
                  src={post.imageUrl || "https://picsum.photos/40/40"}
                  alt="profile"
                  className="rounded-full w-10 h-10"
                />
                <div>
                  <p className="font-semibold">{post.authorName}</p>
                  <p className="text-xs text-gray-500">
                    {post.createdAt?.toDate
                      ? post.createdAt.toDate().toLocaleString()
                      : ""}
                  </p>
                </div>
              </div>
              <span className="text-sm text-gray-500 capitalize">
                {post.category}
              </span>
            </div>

            {/* Post Content */}
            <p className="mt-3 text-gray-700">{post.content}</p>

            {/* Render media content based on type */}
            {renderMediaContent(post)}

            {/* Post Actions */}
            <div className="text-sm text-gray-500 flex gap-4 mt-4 border-t pt-2">
              <span
                onClick={() => handleToggleReact(post.id!)}
                className="cursor-pointer hover:underline"
              >
                👍 Like / Unlike
              </span>

              <span
                onClick={() => openReactsModal(post.id!)}
                className="cursor-pointer hover:underline"
              >
                ({post.reactsCount}) Likes
              </span>

              <span
                onClick={() => handleViewComments(post.id!)}
                className="cursor-pointer hover:underline"
              >
                💬 View Comments ({post.commentsCount})
              </span>
            </div>

            {/* Comments Section */}
            {selectedPostId === post.id && (
              <div className="mt-3 border-t pt-3">
                <h4 className="font-semibold mb-2">Comments</h4>

                {comments[post.id!]?.length ? (
                  comments[post.id!].map((c) => (
                    <div key={c.id} className="mb-2">
                      <p className="text-sm">
                        <span className="font-semibold">
                          {c.authorName || c.user}:
                        </span>{" "}
                        {c.content || c.text}
                      </p>
                      <p className="text-xs text-gray-400">
                        {c.createdAt?.toDate
                          ? c.createdAt.toDate().toLocaleString()
                          : ""}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">No comments yet</p>
                )}

                <div className="flex gap-2 mt-3">
                  <input
                    type="text"
                    placeholder="Write a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    className="flex-1 p-2 border rounded"
                  />
                  <button
                    onClick={() => handleAddComment(post.id!)}
                    className="bg-green-600 text-white px-3 py-2 rounded"
                  >
                    Send
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Right Column - Create Post */}
      {isAdmin && (
        <div className="w-full lg:w-1/3 bg-white p-6 rounded shadow h-fit">
          <h2 className="text-2xl font-bold mb-4 text-gray-800">Create post</h2>

          <div className="flex items-center gap-3 mb-4">
            <img
              src={user?.photoURL || "https://picsum.photos/40/40"}
              alt="profile"
              className="rounded-full w-10 h-10"
            />
            <p className="font-semibold text-gray-800">
              {user?.displayName || "(Name)"}
            </p>
            <div className="flex items-center gap-2 ml-auto">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-2 py-1 border rounded text-sm text-gray-600"
              >
                <option value="announcement">Announcement</option>
                <option value="complaint">Complaint</option>
                <option value="general">General</option>
              </select>
              <label className="flex items-center gap-1 px-3 py-1 bg-gray-200 rounded text-sm text-gray-700 hover:bg-gray-300 cursor-pointer">
                <span className="text-lg">📎</span>
                <span>Attach Files</span>
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileChange}
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                />
              </label>
            </div>
          </div>

          {selectedFileName && (
            <div className="text-sm text-gray-600 mb-2 p-2 bg-gray-50 rounded">
              <strong>Selected file:</strong> {selectedFileName}
              <button
                onClick={() => {
                  setFileToUpload(null);
                  setSelectedFileName("");
                }}
                className="ml-2 text-red-600 hover:text-red-800"
              >
                ✕ Remove
              </button>
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
            className="w-full p-4 border rounded resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 placeholder-gray-400"
            rows={6}
            disabled={isUploading}
          />

          <div className="flex justify-end gap-2 mt-4 border-t pt-4">
            <button
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
              onClick={handleCancelPost}
              disabled={isUploading}
            >
              Cancel
            </button>
            <button
              onClick={handleCreatePost}
              disabled={isUploading || (!content.trim() && !fileToUpload)}
              className={`px-6 py-2 rounded ${
                isUploading || (!content.trim() && !fileToUpload)
                  ? "bg-blue-300 cursor-not-allowed text-white"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            >
              {isUploading ? "Uploading..." : "Upload"}
            </button>
          </div>
        </div>
      )}

      {showReactsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-sm mx-4 p-4">
            <div className="flex justify-between items-center border-b pb-2 mb-4">
              <h3 className="font-bold text-lg">Reacts</h3>
              <button
                onClick={closeReactsModal}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                &times;
              </button>
            </div>

            {reacts[selectedReactPostId!]?.length > 0 ? (
              <div className="max-h-80 overflow-y-auto">
                {reacts[selectedReactPostId!]?.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 p-2 hover:bg-gray-100 rounded"
                  >
                    <img
                      src={"https://picsum.photos/40/40"}
                      alt="profile"
                      className="rounded-full w-8 h-8"
                    />
                    <p className="font-semibold text-gray-800">
                      {r.authorName}
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
    </div>
  );
}