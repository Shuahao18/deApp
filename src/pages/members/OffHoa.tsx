import { useState, useEffect } from "react";
import { MoreVertical } from "lucide-react";
import { db, storage } from "../../Firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  query,
  orderBy,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// --- Interfaces para sa data ---
interface Candidate {
  id: string;
  name: string;
  position: string;
  contactNo: string;
  email: string;
  termDuration: string;
  photoURL?: string;
}

// --- Ang Component mismo ---
export default function OffHoa() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    position: "",
    contactNo: "",
    email: "",
    termDuration: "",
    profileImageFile: null as File | null,
  });

  // Fetching data mula sa Firestore
  useEffect(() => {
    if (!db) {
      console.error("Firestore database is not initialized.");
      return;
    }
    const q = query(collection(db, "candidates"), orderBy("name"));
    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const candidatesList: Candidate[] = [];
        querySnapshot.forEach((doc) => {
          candidatesList.push({ id: doc.id, ...doc.data() } as Candidate);
        });
        setCandidates(candidatesList);
      },
      (error) => {
        console.error("Error fetching candidates:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    setError("");
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData({ ...formData, profileImageFile: file });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    if (!db || !storage) {
      setError("Firebase services are not initialized.");
      setIsSubmitting(false);
      return;
    }

    try {
      let photoURL = "";
      if (formData.profileImageFile) {
        const storageRef = ref(
          storage,
          `candidates/${formData.profileImageFile.name}`
        );
        const snapshot = await uploadBytes(
          storageRef,
          formData.profileImageFile
        );
        photoURL = await getDownloadURL(snapshot.ref);
      }

      // Create a clean object to send to Firestore, excluding the File object
      const dataToSave = {
        name: formData.name,
        position: formData.position,
        contactNo: formData.contactNo,
        email: formData.email,
        termDuration: formData.termDuration,
        photoURL: photoURL,
      };

      await addDoc(collection(db, "candidates"), dataToSave);

      // Reset form data after successful submission
      setFormData({
        name: "",
        position: "",
        contactNo: "",
        email: "",
        termDuration: "",
        profileImageFile: null,
      });

      setShowModal(false);
    } catch (err: any) {
      console.error("Error adding document: ", err);
      setError("Failed to add member. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">HOA Board of members</h1>
      <div className="flex gap-4 mb-6 border-b pb-2">
        {[
          "HOA Boards of members",
          "Sport committee",
          "Waste management",
          "Security Committee",
        ].map((tab) => (
          <button
            key={tab}
            className="px-4 py-2 text-sm font-medium rounded-md hover:bg-gray-100"
          >
            {tab}
          </button>
        ))}
        <button
          onClick={() => setShowModal(true)}
          className="ml-auto bg-green-700 text-white px-4 py-2 rounded-md hover:bg-green-800"
        >
          + Add members
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {candidates.map((c) => (
          <div
            key={c.id}
            className="flex items-center bg-white shadow-md rounded-xl overflow-hidden"
          >
            <div className="w-1/3 bg-gray-200 h-40 flex items-center justify-center">
              {c.photoURL ? (
                <img
                  src={c.photoURL}
                  alt={c.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-gray-600 font-medium">+ Add Image</span>
              )}
            </div>
            <div className="w-2/3 bg-green-800 text-white p-4 relative">
              <button className="absolute top-2 right-2 text-white">
                <MoreVertical />
              </button>
              <p>
                <span className="font-semibold">Name:</span> {c.name}
              </p>
              <p>
                <span className="font-semibold">Position:</span> {c.position}
              </p>
              <p>
                <span className="font-semibold">Contact:</span> {c.contactNo}
              </p>
              <p>
                <span className="font-semibold">Email:</span> {c.email}
              </p>
              <p>
                <span className="font-semibold">Term:</span> {c.termDuration}
              </p>
            </div>
          </div>
        ))}
      </div>
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-4xl">
            <h2 className="text-xl font-semibold mb-4">Add Member</h2>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-6">
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-400 rounded-lg h-64 cursor-pointer">
                {formData.profileImageFile ? (
                  <img
                    src={URL.createObjectURL(formData.profileImageFile)}
                    alt="Preview"
                    className="w-full h-full object-cover rounded-md"
                  />
                ) : (
                  <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer">
                    <span className="text-gray-500">+ Add Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium">Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="w-full border-b border-gray-400 focus:border-green-700 outline-none px-2 py-1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">Role in HOA *</label>
                  <select
                    name="position"
                    value={formData.position}
                    onChange={handleChange}
                    required
                    className={`w-full border-b outline-none px-2 py-1 ${
                      error
                        ? "border-red-500 text-red-600 font-semibold"
                        : "border-gray-400"
                    }`}
                  >
                    <option value="">Select Role</option>
                    <option value="President">President</option>
                    <option value="Vice President">Vice President</option>
                    <option value="Secretary">Secretary</option>
                    <option value="Treasurer">Treasurer</option>
                  </select>
                  {error && (
                    <p className="text-red-500 text-sm mt-1 italic">{error}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium">Contact No. *</label>
                  <input
                    type="text"
                    name="contactNo"
                    value={formData.contactNo}
                    onChange={handleChange}
                    required
                    className="w-full border-b border-gray-400 focus:border-green-700 outline-none px-2 py-1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">Email Address</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full border-b border-gray-400 focus:border-green-700 outline-none px-2 py-1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">Term Duration</label>
                  <input
                    type="text"
                    name="termDuration"
                    value={formData.termDuration}
                    onChange={handleChange}
                    placeholder="e.g. 2 years"
                    className="w-full border-b border-gray-400 focus:border-green-700 outline-none px-2 py-1"
                  />
                </div>
              </div>
              <div className="col-span-2 flex justify-end gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-green-700 text-white px-4 py-2 rounded-md hover:bg-green-800 disabled:bg-gray-400"
                >
                  {isSubmitting ? "Adding..." : "Create Acc."}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}