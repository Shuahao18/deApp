import React, { useState, useEffect, useRef } from "react";
import { db, storage, functions } from "../Firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  addDoc,
  where,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { Plus, MoreVertical, Edit2, X, Link, Unlink } from "lucide-react";
import { UserCircleIcon, ShareIcon } from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";

// --- Custom Alert Component for Electron ---
const CustomAlert: React.FC<{
  show: boolean;
  title: string;
  message: string;
  onClose: () => void;
}> = ({ show, title, message, onClose }) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-gray-600 mb-6">{message}</p>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            autoFocus
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Custom Confirm Component for Electron ---
const CustomConfirm: React.FC<{
  show: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ show, title, message, onConfirm, onCancel }) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-gray-600 mb-6 whitespace-pre-line">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            autoFocus
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Custom hooks for alert/confirm replacement ---
const useCustomAlert = () => {
  const [alertState, setAlertState] = useState({
    show: false,
    title: "",
    message: "",
  });

  const showAlert = (title: string, message: string) => {
    setAlertState({ show: true, title, message });
  };

  const hideAlert = () => {
    setAlertState((prev) => ({ ...prev, show: false }));
  };

  return {
    showAlert,
    hideAlert,
    alertState,
  };
};

const useCustomConfirm = () => {
  const [confirmState, setConfirmState] = useState({
    show: false,
    title: "",
    message: "",
    onConfirm: () => {},
    onCancel: () => {},
  });

  const showConfirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    onCancel?: () => void
  ) => {
    setConfirmState({
      show: true,
      title,
      message,
      onConfirm,
      onCancel: onCancel || (() => {}),
    });
  };

  const hideConfirm = () => {
    setConfirmState((prev) => ({ ...prev, show: false }));
  };

  const handleConfirm = () => {
    confirmState.onConfirm();
    hideConfirm();
  };

  const handleCancel = () => {
    confirmState.onCancel();
    hideConfirm();
  };

  return {
    showConfirm,
    hideConfirm,
    handleConfirm,
    handleCancel,
    confirmState,
  };
};

// --- INTERFACES ---
interface Official {
  id: string;
  name: string;
  position: string;
  contactNo?: string;
  email: string;
  termDuration?: string;
  photoURL?: string | null;
  address?: string;
  authUid?: string;
}

interface CommitteeMember {
  id: string;
  name: string;
  position: string;
  contactNo?: string;
  email?: string;
  dateElected?: string;
  termDuration?: string;
  photoURL?: string | null;
  authUid?: string;
  address?: string;
}

interface CreateUserAccountResponse {
  success: boolean;
  userId: string;
  email: string;
  message: string;
}

interface CreateUserAccountRequest {
  userData: {
    name: string;
    email: string;
    position: string;
    contactNo?: string;
    address?: string;
    termDuration?: string;
  };
  password: string;
}

interface EditModalProps {
  official: Official | null;
  onClose: () => void;
  isAddingNew?: boolean;
  isExecutiveOfficer?: boolean;
}

interface AddMemberModalProps {
  committeeName: string;
  collectionPath: string;
  onClose: () => void;
}

interface LinkAccountModalProps {
  member: Official;
  onClose: () => void;
  onLinkSuccess: () => void;
  onUpdateOfficial: (officialId: string, updates: Partial<Official>) => void;
}

type TabKey =
  | "Executive officers"
  | "Board of Directors"
  | "Committee officers";

interface HOABoardContentProps {
  officials: Official[];
  handleEditClick: (official: Official) => void;
  handleDeleteClick: (official: Official) => void;
  handleAddNewOfficial: () => void;
  handleLinkAccount: (official: Official) => void;
  handleUnlinkAccount: (official: Official) => void;
  openMenuIndex: number | null;
  setOpenMenuIndex: React.Dispatch<React.SetStateAction<number | null>>;
}

interface CommitteeContentProps {
  committeeName: string;
  collectionPath: string;
}

interface TabContentProps extends HOABoardContentProps, CommitteeContentProps {
  tab: TabKey;
}

// --- CONSTANTS ---
const HOA_POSITIONS = ["President", "Vice President", "Secretary", "Treasurer"];
const BOARD_OF_DIRECTORS_POSITIONS = [
  "Chairman of the Board",
  "Vice Chairman of the Board",
  "Board Member",
];
const COMMITTEE_OFFICERS_POSITIONS = [
  "Auditing and Inventory Committee",
  "Financial Management Committee",
  "Membership and Education Committee",
  "Peace and Order Committee",
  "Environment Committee",
  "Election Committee",
];

// --- GLOBAL HELPER FUNCTION ---
const deleteOldPhoto = async (oldPhotoUrl?: string | null) => {
  if (!oldPhotoUrl || !oldPhotoUrl.includes("firebasestorage.googleapis.com"))
    return;

  try {
    const photoRef = ref(storage, oldPhotoUrl);
    await deleteObject(photoRef);
    console.log("Old photo deleted from storage:", oldPhotoUrl);
  } catch (error: any) {
    if (error.code === "storage/object-not-found") {
      console.warn("Old photo not found in storage, skipping deletion.");
    } else {
      console.error("Error deleting old photo:", error);
    }
  }
};

// --- RESPONSIVE MODAL COMPONENTS ---

// *********** LinkAccountModal ***********
const LinkAccountModal: React.FC<LinkAccountModalProps> = ({
  member,
  onClose,
  onLinkSuccess,
  onUpdateOfficial,
}) => {
  const [formData, setFormData] = useState({
    email: member.email || "",
    password: "",
    confirmPassword: "",
  });
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Custom alert hook
  const { showAlert, hideAlert, alertState } = useCustomAlert();

  // Prevent linking if already linked
  useEffect(() => {
    if (member.authUid) {
      setError("This account is already linked. Cannot link again.");
    }
  }, [member.authUid]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Check if already linked
    if (member.authUid) {
      setError("This account is already linked. Cannot link again.");
      return;
    }

    if (!formData.email) {
      setError("Email is required");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters long");
      return;
    }

    setIsLinking(true);

    try {
      const createUserAccount = httpsCallable<
        CreateUserAccountRequest,
        CreateUserAccountResponse
      >(functions, "createUserAccount");

      const userData = {
        name: member.name,
        email: formData.email,
        position: member.position,
        contactNo: member.contactNo || "",
        address: member.address || "",
        termDuration: member.termDuration || "",
      };

      const result = await createUserAccount({
        userData,
        password: formData.password,
      });

      const updateData: any = {
        email: formData.email,
      };

      if (result.data && result.data.userId) {
        updateData.authUid = result.data.userId;
      }

      const officialRef = doc(db, "elected_officials", member.id);
      await updateDoc(officialRef, updateData);

      // IMMEDIATELY UPDATE LOCAL STATE
      onUpdateOfficial(member.id, {
        email: formData.email,
        authUid: result.data?.userId || `temp_${Date.now()}`,
      });

      showAlert("Success", `Account linked successfully for ${member.name}!`);
      onLinkSuccess();
      onClose();
    } catch (error: any) {
      console.error("Error linking account:", error);

      let errorMessage = "Failed to link account. Please try again.";

      if (error.code === "functions/internal") {
        errorMessage = "Internal server error. Please try again later.";
      } else if (
        error.message.includes("email-already-exists") ||
        error.code === "already-exists"
      ) {
        errorMessage =
          "This email is already registered. Please use a different email.";
      } else if (
        error.message.includes("invalid-email") ||
        error.code === "invalid-argument"
      ) {
        errorMessage = "Invalid email address format.";
      } else if (error.message.includes("weak-password")) {
        errorMessage =
          "Password is too weak. Please use a stronger password (at least 6 characters).";
      } else if (error.message.includes("User created successfully")) {
        try {
          const officialRef = doc(db, "elected_officials", member.id);
          await updateDoc(officialRef, {
            email: formData.email,
            authUid: `temp_${Date.now()}`,
          });

          // Update local state
          onUpdateOfficial(member.id, {
            email: formData.email,
            authUid: `temp_${Date.now()}`,
          });

          showAlert(
            "Success",
            `Account linked successfully for ${member.name}! (Note: Please check user ID in Firebase console)`
          );
          onLinkSuccess();
          onClose();
          return;
        } catch (updateError) {
          errorMessage =
            "User created but failed to link account. Please contact administrator.";
        }
      } else {
        errorMessage = error.message || errorMessage;
      }

      setError(errorMessage);
    } finally {
      setIsLinking(false);
    }
  };

  // If account is already linked, show different UI
  if (member.authUid) {
    return (
      <>
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-lg shadow-2xl w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4 text-green-600">
              Account Already Linked
            </h2>
            <div className="p-4 mb-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800">
                <strong>{member.name}</strong>'s account is already linked.
              </p>
              <p className="text-green-700 text-sm mt-2">
                Email: {member.email}
                <br />
                Status: <span className="font-semibold">Linked</span>
              </p>
            </div>
            <div className="flex justify-end pt-4 border-t mt-4">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>

        <CustomAlert
          show={alertState.show}
          title={alertState.title}
          message={alertState.message}
          onClose={hideAlert}
        />
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white p-6 rounded-lg shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
          <h2 className="text-xl font-bold mb-4">
            Link Account for {member.name}
          </h2>
          {error && (
            <div className="p-3 mb-4 text-sm text-red-700 bg-red-100 rounded-lg border border-red-400">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                disabled={isLinking}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                disabled={isLinking}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                placeholder="Minimum 6 characters"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Confirm Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                disabled={isLinking}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-4 border-t mt-6">
              <button
                type="button"
                onClick={onClose}
                disabled={isLinking}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLinking || !!error}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {isLinking ? "Linking..." : "Link Account"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <CustomAlert
        show={alertState.show}
        title={alertState.title}
        message={alertState.message}
        onClose={hideAlert}
      />
    </>
  );
};

// *********** EditOfficialModal - RESPONSIVE VERSION ***********
const EditOfficialModal: React.FC<EditModalProps> = ({
  official,
  onClose,
  isAddingNew = false,
  isExecutiveOfficer = false,
}) => {
  const initialOfficial = official || {
    id: "",
    name: "",
    position: "",
    email: "",
    contactNo: "",
    termDuration: "",
    photoURL: null,
    address: "",
  };

  const [formData, setFormData] = useState({
    name: initialOfficial.name || "",
    position: initialOfficial.position || "",
    contactNo: initialOfficial.contactNo || "",
    email: initialOfficial.email || "",
    termDuration: initialOfficial.termDuration || "",
    address: initialOfficial.address || "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(
    initialOfficial.photoURL || null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Custom alert hook
  const { showAlert, hideAlert, alertState } = useCustomAlert();

  useEffect(() => {
    return () => {
      if (imagePreviewUrl && imagePreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (imagePreviewUrl && imagePreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
      setImagePreviewUrl(URL.createObjectURL(file));
      setError(null);
    } else {
      setSelectedFile(null);
      if (imagePreviewUrl && imagePreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
      setImagePreviewUrl(initialOfficial.photoURL || null);
    }
  };

  const handleClearPhoto = () => {
    setSelectedFile(null);
    if (imagePreviewUrl && imagePreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setImagePreviewUrl(null);
    setError(null);
  };

  const handleImageUpload = async (): Promise<string | null> => {
    if (!selectedFile) return null;

    const officialId = initialOfficial.id || "new";
    const storageRef = ref(
      storage,
      `hoa_officials_photos/${officialId}_${Date.now()}_${selectedFile.name}`
    );
    await uploadBytes(storageRef, selectedFile);
    return getDownloadURL(storageRef);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSaving(true);

    const dataToSave = formData;
    let finalPayload: Partial<Official> = { ...dataToSave };

    try {
      if (!dataToSave.name || !dataToSave.position || !dataToSave.email) {
        setError("Name, Position, and Email are required fields.");
        setIsSaving(false);
        return;
      }

      // Handle photo upload and set photoURL properly
      if (selectedFile) {
        finalPayload.photoURL = await handleImageUpload();
      } else if (!imagePreviewUrl && initialOfficial.photoURL) {
        // If clearing the photo (no preview and had previous photo)
        await deleteOldPhoto(initialOfficial.photoURL);
        finalPayload.photoURL = null; // Explicitly set to null instead of undefined
      } else if (imagePreviewUrl === initialOfficial.photoURL) {
        // Photo unchanged, keep existing URL
        finalPayload.photoURL = initialOfficial.photoURL;
      } else {
        // No photo selected and no existing photo, set to null
        finalPayload.photoURL = null;
      }

      // Ensure photoURL is never undefined
      if (finalPayload.photoURL === undefined) {
        finalPayload.photoURL = null;
      }

      if (isAddingNew) {
        await addDoc(collection(db, "elected_officials"), finalPayload);
        showAlert("Success", "New official added successfully!");
        onClose();
      } else if (official && official.id) {
        const officialRef = doc(db, "elected_officials", official.id);
        await updateDoc(officialRef, finalPayload);
        showAlert("Success", "Official data updated successfully!");
        onClose();
      } else {
        setError(
          "Invalid operation: Cannot add or update without proper context."
        );
        setIsSaving(false);
        return;
      }
    } catch (error: any) {
      console.error("Error processing operation:", error);

      let errorMessage = "Failed to process official data.";
      if (
        error.code === "permission-denied" ||
        (error.message && error.message.includes("permission"))
      ) {
        errorMessage =
          "Permission denied. Please check if you have proper access rights.";
      } else if (error.message) {
        errorMessage = error.message;
      }

      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-gray-200 flex-shrink-0">
            <h2 className="text-xl font-bold">
              {isAddingNew
                ? "Add New HOA Official"
                : `Edit Official: ${initialOfficial.name}`}
              {isExecutiveOfficer && (
                <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  Executive Officer
                </span>
              )}
            </h2>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {error && (
              <div className="p-3 mb-4 text-sm text-red-700 bg-red-100 rounded-lg border border-red-400">
                {error}
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Photo Section */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Profile Photo
                </label>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-shrink-0">
                    {imagePreviewUrl ? (
                      <div className="relative">
                        <img
                          src={imagePreviewUrl}
                          alt="Preview"
                          className="w-20 h-20 rounded-full object-cover border border-gray-300"
                        />
                        <button
                          type="button"
                          onClick={handleClearPhoto}
                          className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 text-xs hover:bg-red-600 transition-colors"
                          aria-label="Clear photo"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs text-center">
                        No Image
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      className="hidden"
                      accept="image/*"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                    >
                      {imagePreviewUrl ? "Change Photo" : "Upload Photo"}
                    </button>
                    <p className="text-xs text-gray-500 mt-2">
                      Recommended: Square image, max 5MB
                    </p>
                  </div>
                </div>
              </div>

              {/* Form Fields - Responsive Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Name */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Position */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Position <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="position"
                    value={formData.position}
                    onChange={handleChange}
                    required
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select a position</option>
                    {HOA_POSITIONS.map((position) => (
                      <option key={position} value={position}>
                        {position}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Contact Number */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Contact Number
                  </label>
                  <input
                    type="text"
                    name="contactNo"
                    value={formData.contactNo}
                    onChange={handleChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Address */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Address
                  </label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter full address"
                  />
                </div>

                {/* Term Duration */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Term Duration
                  </label>
                  <input
                    type="text"
                    name="termDuration"
                    value={formData.termDuration}
                    onChange={handleChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., 2 years or until next election"
                  />
                </div>
              </div>
            </form>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-200 bg-gray-50 flex-shrink-0">
            <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors order-2 sm:order-1"
              >
                Cancel
              </button>
              <button
                type="submit"
                onClick={handleSubmit}
                disabled={isSaving || !!error}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors order-1 sm:order-2"
              >
                {isSaving
                  ? "Saving..."
                  : isAddingNew
                    ? "Add Officer"
                    : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <CustomAlert
        show={alertState.show}
        title={alertState.title}
        message={alertState.message}
        onClose={hideAlert}
      />
    </>
  );
};

// *********** AddMemberModal - RESPONSIVE VERSION ***********
const AddMemberModal: React.FC<AddMemberModalProps> = ({
  committeeName,
  onClose,
  collectionPath,
}) => {
  const formatCommitteeName = (name: string) =>
    name
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: "",
    position: "",
    contactNo: "",
    email: "",
    dateElected: "",
    termDuration: "",
    address: "",
  });
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [headExists, setHeadExists] = useState(false);

  // Custom alert hook
  const { showAlert, hideAlert, alertState } = useCustomAlert();

  useEffect(() => {
    return () => {
      if (imagePreviewUrl && imagePreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  useEffect(() => {
    if (!db || !collectionPath) return;

    let positionToCheck = "Committee Head";
    if (collectionPath === "board_of_directors") {
      positionToCheck = "Chairman of the Board";
    }

    const q = query(
      collection(db, collectionPath),
      where("position", "==", positionToCheck)
    );

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        setHeadExists(!querySnapshot.empty);
      },
      (e) => {
        console.error(
          `Error checking for ${positionToCheck} in ${collectionPath}:`,
          e
        );
        setHeadExists(false);
      }
    );

    return () => unsubscribe();
  }, [collectionPath]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setError(null);

    const { name, value } = e.target;

    if (
      collectionPath === "board_of_directors" &&
      name === "position" &&
      value === "Chairman of the Board" &&
      headExists
    ) {
      setError("Only one 'Chairman of the Board' is allowed per board.");
      return;
    }

    if (
      collectionPath !== "board_of_directors" &&
      name === "position" &&
      value === "Committee Head" &&
      headExists
    ) {
      setError("Only one 'Committee Head' is allowed per committee.");
      return;
    }

    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);

      if (imagePreviewUrl && imagePreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
      setImagePreviewUrl(URL.createObjectURL(file));
      setError(null);
    } else {
      setSelectedFile(null);
      if (imagePreviewUrl && imagePreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
      setImagePreviewUrl(null);
    }
  };

  const handleClearPhoto = () => {
    setSelectedFile(null);
    if (imagePreviewUrl && imagePreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setImagePreviewUrl(null);
    setError(null);
  };

  const handleImageUpload = async (): Promise<string | null> => {
    if (!selectedFile) return null;

    const storageRef = ref(
      storage,
      `committee_members_photos/${collectionPath}/new_${Date.now()}_${selectedFile.name}`
    );
    await uploadBytes(storageRef, selectedFile);
    return getDownloadURL(storageRef);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsAdding(true);

    const dataToAdd = formData;
    let finalPayload: Partial<CommitteeMember> = { ...dataToAdd };

    try {
      if (!dataToAdd.name || !dataToAdd.position || !dataToAdd.email) {
        setError("Name, Position, and Email are required fields.");
        setIsAdding(false);
        return;
      }

      if (
        collectionPath === "board_of_directors" &&
        dataToAdd.position === "Chairman of the Board" &&
        headExists
      ) {
        setError(
          "A 'Chairman of the Board' already exists for this board. Please select another position or edit the existing chairman."
        );
        setIsAdding(false);
        return;
      }

      if (
        collectionPath !== "board_of_directors" &&
        dataToAdd.position === "Committee Head" &&
        headExists
      ) {
        setError(
          "A 'Committee Head' already exists for this committee. Please select another position or edit the existing head."
        );
        setIsAdding(false);
        return;
      }

      // Handle photo upload properly
      if (selectedFile) {
        finalPayload.photoURL = await handleImageUpload();
      } else {
        finalPayload.photoURL = null; // Explicitly set to null instead of undefined
      }

      await addDoc(collection(db, collectionPath), finalPayload);

      showAlert(
        "Success",
        `${formData.name} added to ${formatCommitteeName(committeeName)} successfully!`
      );
      onClose();
    } catch (error: any) {
      console.error("Error adding member:", error);

      let errorMessage = "Failed to add member.";
      if (
        error.code === "permission-denied" ||
        (error.message && error.message.includes("permission"))
      ) {
        errorMessage =
          "Permission denied. Please check if you have proper access rights.";
      } else if (error.message) {
        errorMessage = error.message;
      }

      setError(errorMessage);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-gray-200 flex-shrink-0">
            <h2 className="text-xl font-bold">
              Add Member to {formatCommitteeName(committeeName)}
            </h2>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {error && (
              <div className="p-3 mb-4 text-sm text-red-700 bg-red-100 rounded-lg border border-red-400">
                {error}
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Photo Section */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Profile Photo
                </label>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-shrink-0">
                    {imagePreviewUrl ? (
                      <div className="relative">
                        <img
                          src={imagePreviewUrl}
                          alt="Preview"
                          className="w-20 h-20 rounded-full object-cover border border-gray-300"
                        />
                        <button
                          type="button"
                          onClick={handleClearPhoto}
                          className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 text-xs hover:bg-red-600 transition-colors"
                          aria-label="Clear photo"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs text-center">
                        No Image
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      className="hidden"
                      accept="image/*"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                    >
                      {selectedFile ? "Change Photo" : "Upload Photo"}
                    </button>
                    <p className="text-xs text-gray-500 mt-2">
                      Recommended: Square image, max 5MB
                    </p>
                  </div>
                </div>
              </div>

              {/* Form Fields - Responsive Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Name */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Position */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Position <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="position"
                    value={formData.position}
                    onChange={handleChange}
                    required
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select a position</option>
                    {collectionPath === "board_of_directors" ? (
                      <>
                        <option
                          value="Chairman of the Board"
                          disabled={
                            headExists &&
                            formData.position !== "Chairman of the Board"
                          }
                        >
                          Chairman of the Board
                        </option>
                        <option value="Vice Chairman of the Board">
                          Vice Chairman of the Board
                        </option>
                        <option value="Board Member">Board Member</option>
                      </>
                    ) : collectionPath === "committee_officers" ? (
                      <>
                        <option value="Auditing and Inventory Committee">
                          Auditing and Inventory Committee
                        </option>
                        <option value="Financial Management Committee">
                          Financial Management Committee
                        </option>
                        <option value="Membership and Education Committee">
                          Membership and Education Committee
                        </option>
                        <option value="Peace and Order Committee">
                          Peace and Order Committee
                        </option>
                        <option value="Environment Committee">
                          Environment Committee
                        </option>
                        <option value="Election Committee">
                          Election Committee
                        </option>
                      </>
                    ) : (
                      <>
                        <option
                          value="Committee Head"
                          disabled={
                            headExists && formData.position !== "Committee Head"
                          }
                        >
                          Committee Head
                        </option>
                        <option value="Member">Member</option>
                        <option value="Secretary">Secretary</option>
                        <option value="Treasurer">Treasurer</option>
                      </>
                    )}
                  </select>
                  {headExists &&
                    (formData.position === "Chairman of the Board" ||
                      formData.position === "Committee Head") && (
                      <p className="text-xs text-red-500 mt-1">
                        A {formData.position} already exists. Only one is allowed.
                      </p>
                    )}
                </div>

                {/* Contact Number */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Contact Number
                  </label>
                  <input
                    type="text"
                    name="contactNo"
                    value={formData.contactNo}
                    onChange={handleChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Address */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Address
                  </label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter full address"
                  />
                </div>

                {/* Date Elected */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Date Elected
                  </label>
                  <input
                    type="date"
                    name="dateElected"
                    value={formData.dateElected}
                    onChange={handleChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Term Duration */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Term Duration
                  </label>
                  <input
                    type="text"
                    name="termDuration"
                    value={formData.termDuration}
                    onChange={handleChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., 2 years"
                  />
                </div>
              </div>
            </form>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-200 bg-gray-50 flex-shrink-0">
            <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors order-2 sm:order-1"
              >
                Cancel
              </button>
              <button
                type="submit"
                onClick={handleSubmit}
                disabled={isAdding || !!error}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors order-1 sm:order-2"
              >
                {isAdding ? "Adding..." : "Add Officer"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <CustomAlert
        show={alertState.show}
        title={alertState.title}
        message={alertState.message}
        onClose={hideAlert}
      />
    </>
  );
};

// *********** EditCommitteeMemberModal ***********
interface EditCommitteeMemberModalProps {
  member: CommitteeMember;
  onClose: () => void;
  collectionPath: string;
}

const EditCommitteeMemberModal: React.FC<EditCommitteeMemberModalProps> = ({
  member,
  onClose,
  collectionPath,
}) => {
  const [formData, setFormData] = useState({
    name: member.name,
    position: member.position,
    contactNo: member.contactNo || "",
    email: member.email || "",
    dateElected: member.dateElected || "",
    termDuration: member.termDuration || "",
    address: member.address || "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(
    member.photoURL || null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Custom alert hook
  const { showAlert, hideAlert, alertState } = useCustomAlert();

  useEffect(() => {
    return () => {
      if (imagePreviewUrl && imagePreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setError(null);
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (imagePreviewUrl && imagePreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
      setImagePreviewUrl(URL.createObjectURL(file));
      setError(null);
    } else {
      setSelectedFile(null);
      if (imagePreviewUrl && imagePreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(imagePreviewUrl);
      }
      setImagePreviewUrl(member.photoURL || null);
    }
  };

  const handleClearPhoto = () => {
    setSelectedFile(null);
    if (imagePreviewUrl && imagePreviewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setImagePreviewUrl(null);
    setError(null);
  };

  const handleImageUpload = async (): Promise<string | null> => {
    if (!selectedFile) return null;

    const storageRef = ref(
      storage,
      `committee_members_photos/${collectionPath}/${member.id}_${Date.now()}_${selectedFile.name}`
    );
    await uploadBytes(storageRef, selectedFile);
    return getDownloadURL(storageRef);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    const dataToUpdate = formData;
    let finalPayload: Partial<CommitteeMember> = { ...dataToUpdate };

    try {
      const newPhotoURL = await handleImageUpload();
      finalPayload.photoURL = newPhotoURL;

      if (member.photoURL) {
        if (newPhotoURL && newPhotoURL !== member.photoURL) {
          await deleteOldPhoto(member.photoURL);
        } else if (!newPhotoURL && member.photoURL) {
          await deleteOldPhoto(member.photoURL);
          finalPayload.photoURL = null;
        }
      }

      // Ensure photoURL is never undefined
      if (finalPayload.photoURL === undefined) {
        finalPayload.photoURL = null;
      }

      const memberRef = doc(db, collectionPath, member.id);
      await updateDoc(memberRef, finalPayload);
      showAlert("Success", "Committee member updated successfully!");
      onClose();
    } catch (err: any) {
      console.error("Error updating committee member:", err);
      setError(err.message || "Failed to update member.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white p-6 rounded-lg shadow-2xl w-full max-w-md mx-4">
          <h2 className="text-xl font-bold mb-4">
            Edit Committee Member: {member.name}
          </h2>
          {error && (
            <div className="p-3 mb-4 text-sm text-red-700 bg-red-100 rounded-lg border border-red-400">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Profile Photo
              </label>
              <div className="mt-1 flex items-center space-x-4">
                {imagePreviewUrl ? (
                  <div className="relative">
                    <img
                      src={imagePreviewUrl}
                      alt="Preview"
                      className="w-20 h-20 rounded-full object-cover border border-gray-300"
                    />
                    <button
                      type="button"
                      onClick={handleClearPhoto}
                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 text-xs hover:bg-red-600 transition-colors"
                      aria-label="Clear photo"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs text-center">
                    No Image
                  </div>
                )}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept="image/*"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                >
                  {imagePreviewUrl ? "Change Photo" : "Upload Photo"}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Position <span className="text-red-500">*</span>
              </label>
              <select
                name="position"
                value={formData.position}
                onChange={handleChange}
                required
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
              >
                <option value="">Select a position</option>
                {collectionPath === "board_of_directors" ? (
                  <>
                    <option value="Chairman of the Board">
                      Chairman of the Board
                    </option>
                    <option value="Vice Chairman of the Board">
                      Vice Chairman of the Board
                    </option>
                    <option value="Board Member">Board Member</option>
                  </>
                ) : collectionPath === "committee_officers" ? (
                  <>
                    <option value="Auditing and Inventory Committee">
                      Auditing and Inventory Committee
                    </option>
                    <option value="Financial Management Committee">
                      Financial Management Committee
                    </option>
                    <option value="Membership and Education Committee">
                      Membership and Education Committee
                    </option>
                    <option value="Peace and Order Committee">
                      Peace and Order Committee
                    </option>
                    <option value="Environment Committee">
                      Environment Committee
                    </option>
                    <option value="Election Committee">
                      Election Committee
                    </option>
                  </>
                ) : (
                  <>
                    <option value="Committee Head">Committee Head</option>
                    <option value="Member">Member</option>
                    <option value="Secretary">Secretary</option>
                    <option value="Treasurer">Treasurer</option>
                  </>
                )}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Contact Number
              </label>
              <input
                type="text"
                name="contactNo"
                value={formData.contactNo}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Address
              </label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                placeholder="Enter full address"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Term Duration
              </label>
              <input
                type="text"
                name="termDuration"
                value={formData.termDuration}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-4 border-t mt-6">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <CustomAlert
        show={alertState.show}
        title={alertState.title}
        message={alertState.message}
        onClose={hideAlert}
      />
    </>
  );
};

// *********** CommitteeContent ***********
const CommitteeContent: React.FC<CommitteeContentProps> = ({
  committeeName,
  collectionPath,
}) => {
  const [members, setMembers] = useState<CommitteeMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [memberToEdit, setMemberToEdit] = useState<CommitteeMember | null>(
    null
  );
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);

  // Custom hooks for alerts and confirms
  const { showAlert, hideAlert, alertState } = useCustomAlert();
  const {
    showConfirm,
    hideConfirm,
    handleConfirm,
    handleCancel,
    confirmState,
  } = useCustomConfirm();

  useEffect(() => {
    if (!db || !collectionPath) return;

    const q = query(
      collection(db, collectionPath),
      orderBy("position", "desc"),
      orderBy("name")
    );

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const membersList: CommitteeMember[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          membersList.push({
            id: doc.id,
            name: data.name || "",
            position: data.position || "",
            contactNo: data.contactNo || "",
            email: data.email || "",
            termDuration: data.termDuration || "",
            dateElected: data.dateElected || "",
            address: data.address || "",
            photoURL: data.photoURL,
            authUid: data.authUid || undefined,
          } as CommitteeMember);
        });

        const sortedMembers = membersList.sort((a, b) => {
          if (collectionPath === "board_of_directors") {
            const positionOrder = [
              "Chairman of the Board",
              "Vice Chairman of the Board",
              "Board Member",
            ];
            const aIndex = positionOrder.indexOf(a.position);
            const bIndex = positionOrder.indexOf(b.position);

            if (aIndex > -1 && bIndex > -1) return aIndex - bIndex;
            if (aIndex > -1) return -1;
            if (bIndex > -1) return 1;
          } else if (collectionPath === "committee_officers") {
            const committeeOrder = [
              "Auditing and Inventory Committee",
              "Election Committee",
              "Environment Committee",
              "Financial Management Committee",
              "Membership and Education Committee",
              "Peace and Order Committee",
            ];
            const aIndex = committeeOrder.indexOf(a.position);
            const bIndex = committeeOrder.indexOf(b.position);

            if (aIndex > -1 && bIndex > -1) return aIndex - bIndex;
            if (aIndex > -1) return -1;
            if (bIndex > -1) return 1;
          } else {
            if (
              a.position === "Committee Head" &&
              b.position !== "Committee Head"
            )
              return -1;
            if (
              a.position !== "Committee Head" &&
              b.position === "Committee Head"
            )
              return 1;
          }

          return a.name.localeCompare(b.name);
        });

        setMembers(sortedMembers);
        setIsLoading(false);
      },
      (error) => {
        console.error(`Error fetching members from ${collectionPath}:`, error);
        setMembers([]);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [collectionPath]);

  const formatCommitteeName = (name: string) =>
    name
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

  const handleDelete = async (member: CommitteeMember) => {
    showConfirm(
      "Confirm Deletion",
      `Are you sure you want to delete ${member.name} from the ${formatCommitteeName(committeeName)}? This cannot be undone.`,
      async () => {
        try {
          if (member.photoURL) {
            await deleteOldPhoto(member.photoURL);
          }

          await deleteDoc(doc(db, collectionPath, member.id));
          showAlert("Success", `${member.name} deleted successfully!`);
        } catch (error) {
          console.error("Error deleting member:", error);
          showAlert(
            "Error",
            "Failed to delete member. Check console for details."
          );
        } finally {
          setOpenMenuIndex(null);
        }
      }
    );
  };

  const handleEditMemberClick = (member: CommitteeMember) => {
    setMemberToEdit(member);
    setIsEditModalOpen(true);
    setOpenMenuIndex(null);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-800">
          {formatCommitteeName(committeeName)}
        </h2>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors shadow-md"
        >
          <Plus className="w-4 h-4 mr-1" /> Add Officer
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {isLoading ? (
          <p className="col-span-full p-4 text-gray-500">Loading members...</p>
        ) : members.length > 0 ? (
          members.map((m, index) => (
            <div
              key={m.id}
              className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200 hover:shadow-xl transition-shadow duration-300"
            >
              <div className="h-48 bg-gradient-to-br from-green-600 to-green-800 relative">
                {m.photoURL ? (
                  <img
                    src={m.photoURL}
                    alt={m.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-200">
                    <UserCircleIcon className="h-16 w-16 text-gray-400" />
                  </div>
                )}

                <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white p-2">
                  <p className="text-sm font-semibold text-center truncate">
                    {m.position}
                  </p>
                </div>

                <div className="absolute top-3 right-3">
                  <button
                    className="bg-white bg-opacity-90 rounded-full p-1 hover:bg-opacity-100 transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuIndex(openMenuIndex === index ? null : index);
                    }}
                  >
                    <MoreVertical size={16} className="text-gray-700" />
                  </button>

                  {openMenuIndex === index && (
                    <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-xl py-1 z-10 text-gray-800 border border-gray-200">
                      <button
                        onClick={() => handleEditMemberClick(m)}
                        className="flex items-center w-full px-4 py-2 text-sm hover:bg-gray-50"
                      >
                        <Edit2 className="w-4 h-4 mr-2" /> Edit
                      </button>
                      <button
                        onClick={() => handleDelete(m)}
                        className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        <span className="w-4 h-4 mr-2">🗑️</span> Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4">
                <h3 className="text-lg font-bold text-gray-800 mb-2 truncate">
                  {m.name}
                </h3>

                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-start">
                    <span className="font-medium w-20 flex-shrink-0">
                      Contact:
                    </span>
                    <span className="flex-1">{m.contactNo || "N/A"}</span>
                  </div>
                  <div className="flex items-start">
                    <span className="font-medium w-20 flex-shrink-0">
                      Email:
                    </span>
                    <span className="flex-1 truncate">{m.email || "N/A"}</span>
                  </div>
                  <div className="flex items-start">
                    <span className="font-medium w-20 flex-shrink-0">
                      Address:
                    </span>
                    <span className="flex-1 line-clamp-2">
                      {m.address || "N/A"}
                    </span>
                  </div>
                  <div className="flex items-start">
                    <span className="font-medium w-20 flex-shrink-0">
                      Term:
                    </span>
                    <span className="flex-1">{m.termDuration || "N/A"}</span>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full text-center py-12">
            <div className="text-gray-400 mb-4">
              <UserCircleIcon className="h-16 w-16 mx-auto" />
            </div>
            <p className="text-gray-500 text-lg mb-2">No members found</p>
            <p className="text-gray-400 text-sm">
              Click "Add Member" to add the first member
            </p>
          </div>
        )}
      </div>

      {isAddModalOpen && (
        <AddMemberModal
          committeeName={committeeName}
          collectionPath={collectionPath}
          onClose={() => setIsAddModalOpen(false)}
        />
      )}
      {isEditModalOpen && memberToEdit && (
        <EditCommitteeMemberModal
          member={memberToEdit}
          onClose={() => {
            setIsEditModalOpen(false);
            setMemberToEdit(null);
          }}
          collectionPath={collectionPath}
        />
      )}

      {/* Global Alert and Confirm Components */}
      <CustomAlert
        show={alertState.show}
        title={alertState.title}
        message={alertState.message}
        onClose={hideAlert}
      />

      <CustomConfirm
        show={confirmState.show}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  );
};

// *********** HOABoardContent ***********
const HOABoardContent: React.FC<HOABoardContentProps> = ({
  officials,
  handleEditClick,
  handleDeleteClick,
  handleAddNewOfficial,
  handleLinkAccount,
  handleUnlinkAccount,
  openMenuIndex,
  setOpenMenuIndex,
}) => {
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-800">
          Executive Officers
        </h2>
        <button
          onClick={handleAddNewOfficial}
          className="flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors shadow-md"
        >
          <Plus className="w-4 h-4 mr-1" /> Add Officer
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {officials.length > 0 ? (
          officials.map((o, index) => (
            <div
              key={o.id}
              className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200 hover:shadow-xl transition-shadow duration-300"
            >
              {/* Profile Image Section */}
              <div className="h-48 bg-gradient-to-br from-green-600 to-green-800 relative">
                {o.photoURL ? (
                  <img
                    src={o.photoURL}
                    alt={o.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-200">
                    <UserCircleIcon className="h-16 w-16 text-gray-400" />
                  </div>
                )}

                {/* Position Badge */}
                <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white p-2">
                  <p className="text-sm font-semibold text-center truncate">
                    {o.position}
                  </p>
                </div>

                {/* Menu Button */}
                <div className="absolute top-3 right-3">
                  <button
                    className="bg-white bg-opacity-90 rounded-full p-1 hover:bg-opacity-100 transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuIndex(openMenuIndex === index ? null : index);
                    }}
                  >
                    <MoreVertical size={16} className="text-gray-700" />
                  </button>

                  {openMenuIndex === index && (
                    <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-xl py-1 z-10 text-gray-800 border border-gray-200">
                      <button
                        onClick={() => handleEditClick(o)}
                        className="flex items-center w-full px-4 py-2 text-sm hover:bg-gray-50"
                      >
                        <Edit2 className="w-4 h-4 mr-2" /> Edit
                      </button>
                      {o.authUid ? (
                        <button
                          onClick={() => handleUnlinkAccount(o)}
                          className="flex items-center w-full px-4 py-2 text-sm text-orange-600 hover:bg-orange-50"
                        >
                          <Unlink className="w-4 h-4 mr-2" /> Unlink Account
                        </button>
                      ) : (
                        <button
                          onClick={() => handleLinkAccount(o)}
                          className="flex items-center w-full px-4 py-2 text-sm text-blue-600 hover:bg-blue-50"
                        >
                          <Link className="w-4 h-4 mr-2" /> Link Account
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteClick(o)}
                        className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        <span className="w-4 h-4 mr-2">🗑️</span> Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Information Section */}
              <div className="p-4">
                <h3 className="text-lg font-bold text-gray-800 mb-2 truncate">
                  {o.name}
                </h3>

                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-start">
                    <span className="font-medium w-20 flex-shrink-0">
                      Contact:
                    </span>
                    <span className="flex-1">{o.contactNo || "N/A"}</span>
                  </div>
                  <div className="flex items-start">
                    <span className="font-medium w-20 flex-shrink-0">
                      Email:
                    </span>
                    <span className="flex-1 truncate">{o.email || "N/A"}</span>
                  </div>
                  <div className="flex items-start">
                    <span className="font-medium w-20 flex-shrink-0">
                      Address:
                    </span>
                    <span className="flex-1 line-clamp-2">
                      {o.address || "N/A"}
                    </span>
                  </div>
                  <div className="flex items-start">
                    <span className="font-medium w-20 flex-shrink-0">
                      Term:
                    </span>
                    <span className="flex-1">{o.termDuration || "N/A"}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="font-medium w-20 flex-shrink-0">
                      Account:
                    </span>
                    <span
                      className={`flex-1 text-xs px-2 py-1 rounded-full ${
                        o.authUid
                          ? "bg-green-100 text-green-800 border border-green-200"
                          : "bg-gray-100 text-gray-800 border border-gray-200"
                      }`}
                    >
                      {o.authUid ? "Linked" : "Not Linked"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full text-center py-12">
            <div className="text-gray-400 mb-4">
              <UserCircleIcon className="h-16 w-16 mx-auto" />
            </div>
            <p className="text-gray-500 text-lg mb-2">
              No executive officials found
            </p>
            <p className="text-gray-400 text-sm">
              Click "Add Board Member" to add the first official
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// *********** TabContent - MISSING COMPONENT ADDED ***********
const COMMITTEE_COLLECTIONS: Record<string, string> = {
  "Board of Directors": "board_of_directors",
  "Committee officers": "committee_officers",
};

const TabContent: React.FC<TabContentProps> = (props) => {
  if (props.tab === "Executive officers") {
    return <HOABoardContent {...props} />;
  }

  const collectionPath = COMMITTEE_COLLECTIONS[props.tab];

  if (!collectionPath) {
    return <p className="p-4 text-red-500">Invalid committee tab selected.</p>;
  }

  return (
    <CommitteeContent
      committeeName={props.tab}
      collectionPath={collectionPath}
    />
  );
};

// --- MAIN COMPONENT ---
export default function OffHoa() {
  const [officials, setOfficials] = useState<Official[]>([]);
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [officialToEdit, setOfficialToEdit] = useState<Official | null>(null);
  const [officialToAdd, setOfficialToAdd] = useState<boolean>(false);
  const [memberToLink, setMemberToLink] = useState<Official | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("Executive officers");

  // Custom hooks for alerts and confirms
  const { showAlert, hideAlert, alertState } = useCustomAlert();
  const {
    showConfirm,
    hideConfirm,
    handleConfirm,
    handleCancel,
    confirmState,
  } = useCustomConfirm();

  const navigate = useNavigate();

  const handleAdminClick = () => {
    navigate("/EditModal");
  };

  useEffect(() => {
    if (!db) return;

    const q = query(collection(db, "elected_officials"), orderBy("position"));

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const officialsList: Official[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          officialsList.push({
            id: doc.id,
            name: data.name || "",
            position: data.position || "",
            contactNo: data.contactNo || "",
            email: data.email || "",
            termDuration: data.termDuration || "",
            address: data.address || "",
            photoURL: data.photoURL,
            authUid: data.authUid || undefined,
          } as Official);
        });
        const sortedOfficials = officialsList.sort((a, b) => {
          const positionOrder = [
            "President",
            "Vice President",
            "Secretary",
            "Treasurer",
          ];
          const aIndex = positionOrder.indexOf(a.position);
          const bIndex = positionOrder.indexOf(b.position);

          if (aIndex > -1 && bIndex > -1) return aIndex - bIndex;
          if (aIndex > -1) return -1;
          if (bIndex > -1) return 1;
          return a.name.localeCompare(b.name);
        });
        setOfficials(sortedOfficials);
      },
      (error) => {
        console.error("Error fetching elected officials:", error);
        setOfficials([]);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleEditClick = (official: Official) => {
    setOfficialToEdit(official);
    setOfficialToAdd(false);
    setOpenMenuIndex(null);
  };

  const handleAddNewOfficial = () => {
    setOfficialToEdit(null);
    setOfficialToAdd(true);
    setOpenMenuIndex(null);
  };

  const handleDeleteClick = async (official: Official) => {
    showConfirm(
      "Confirm Deletion",
      `Are you sure you want to permanently delete the official: ${official.name} (${official.position})? This action cannot be undone.`,
      async () => {
        try {
          if (official.photoURL) {
            await deleteOldPhoto(official.photoURL);
          }

          await deleteDoc(doc(db, "elected_officials", official.id));
          showAlert("Success", `${official.name} deleted successfully!`);
        } catch (error) {
          console.error("Error deleting official:", error);
          showAlert(
            "Error",
            "Failed to delete official. Check console for details."
          );
        }
      }
    );
    setOpenMenuIndex(null);
  };

  const handleLinkAccount = (official: Official) => {
    setMemberToLink(official);
    setOpenMenuIndex(null);
  };

  const handleUnlinkAccount = async (official: Official) => {
    showConfirm(
      "Confirm Unlink",
      `Are you sure you want to unlink the account for ${official.name}? They will no longer be able to log in.`,
      async () => {
        try {
          const officialRef = doc(db, "elected_officials", official.id);
          await updateDoc(officialRef, {
            authUid: null,
          });

          // Update local state immediately for better UX
          setOfficials((prev) =>
            prev.map((o) =>
              o.id === official.id ? { ...o, authUid: undefined } : o
            )
          );

          showAlert(
            "Success",
            `Account unlinked successfully for ${official.name}!`
          );
        } catch (error) {
          console.error("Error unlinking account:", error);
          showAlert("Error", "Failed to unlink account. Please try again.");
        }
      }
    );
    setOpenMenuIndex(null);
  };

  const handleUpdateOfficial = (
    officialId: string,
    updates: Partial<Official>
  ) => {
    setOfficials((prev) =>
      prev.map((official) =>
        official.id === officialId ? { ...official, ...updates } : official
      )
    );
  };

  const handleLinkSuccess = () => {
    setMemberToLink(null);
    // The data will automatically refresh via the onSnapshot listeners
  };

  const tabs: TabKey[] = [
    "Executive officers",
    "Board of Directors",
    "Committee officers",
  ];

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* UPDATED HEADER - Same as Dashboard */}
      <header className="w-full bg-[#1e4643] text-white shadow-lg p-3 px-4 sm:px-6 flex justify-between items-center flex-shrink-0">
        {/* Page Title - Left Side */}
        <div className="flex items-center space-x-2 sm:space-x-4">
          <h1 className="text-sm font-Montserrat font-extrabold text-yel">
            HOA Officials
          </h1>
        </div>

        {/* Empty Center for Balance */}
        <div className="flex-1"></div>

        {/* Profile/User Icon on the Right */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          <div
            className="flex items-center space-x-2 cursor-pointer hover:bg-white/20 p-1 pr-2 rounded-full transition-colors"
            onClick={handleAdminClick}
          >
            <UserCircleIcon className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
            <span className="text-sm font-medium hidden sm:inline">Admin</span>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="space-y-4 sm:space-y-6">
          {/* Tabs Section - Responsive */}
          <div className="bg-object rounded-xl shadow-sm p-1 mb-4 sm:mb-6 border border-gray-200 overflow-x-auto">
            <nav className="flex min-w-max">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`
                    flex-1 py-2 sm:py-3 px-3 sm:px-4 text-center font-medium text-xs sm:text-sm transition-all duration-200 rounded-lg mx-1 min-w-[120px] sm:min-w-0
                    ${
                      activeTab === tab
                        ? "bg-[#007963] text-white shadow-md"
                        : "text-white hover:text-[#007963] hover:bg-yel"
                    }
                  `}
                >
                  {tab}
                </button>
              ))}
            </nav>
          </div>

          {/* Content Area */}
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-6">
            <TabContent
              tab={activeTab}
              officials={officials}
              handleEditClick={handleEditClick}
              handleDeleteClick={handleDeleteClick}
              handleAddNewOfficial={handleAddNewOfficial}
              handleLinkAccount={handleLinkAccount}
              handleUnlinkAccount={handleUnlinkAccount}
              openMenuIndex={openMenuIndex}
              setOpenMenuIndex={setOpenMenuIndex}
              committeeName={
                activeTab === "Executive officers" ? "" : activeTab
              }
              collectionPath={
                activeTab === "Executive officers"
                  ? ""
                  : COMMITTEE_COLLECTIONS[activeTab] || ""
              }
            />
          </div>

          {/* MODALS */}
          {(officialToEdit || officialToAdd) && (
            <EditOfficialModal
              official={officialToEdit}
              isAddingNew={officialToAdd}
              isExecutiveOfficer={activeTab === "Executive officers"}
              onClose={() => {
                setOfficialToEdit(null);
                setOfficialToAdd(false);
              }}
            />
          )}

          {memberToLink && (
            <LinkAccountModal
              member={memberToLink}
              onClose={() => setMemberToLink(null)}
              onLinkSuccess={handleLinkSuccess}
              onUpdateOfficial={handleUpdateOfficial}
            />
          )}
        </div>
      </main>

      {/* Global Alert and Confirm Components */}
      <CustomAlert
        show={alertState.show}
        title={alertState.title}
        message={alertState.message}
        onClose={hideAlert}
      />

      <CustomConfirm
        show={confirmState.show}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  );
}