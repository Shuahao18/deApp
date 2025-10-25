import React, { useEffect, useMemo, useState } from "react";
import { FiClock, FiPlus, FiXCircle } from "react-icons/fi";
import { FaUsers, FaCheckCircle } from "react-icons/fa";
import { db, storage } from "../Firebase";
import { collection, query, onSnapshot, getDocs, Timestamp, doc, writeBatch, where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { UserCircleIcon, ShareIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';

// The Candidate type reflects the data to be saved to Firestore
type Candidate = {
  name: string;
  position: string;
  termDuration: string;
  photoURL: string;
};

// Updated type for the data you want to display on the dashboard
type DisplayCandidate = {
  id: string;
  name: string;
  position: string;
  votes: number;
  photoURL: string;
};

// Type for election details
type ElectionDetails = {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
};

type Election = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  endTimestamp?: Timestamp;
};

const resetElectionForm = () => ({
  title: "",
  date: "",
  startTime: "",
  endTime: "",
});

const resetCandidateForm = () => ({
  name: "",
  position: "President",
  termDuration: "",
  imageFile: null as File | null,
});

// Helper for assigning a display order to positions
const POSITION_ORDER = ["President", "Vice President", "Treasurer", "Secretary"];

  
export default function ElectionDashboard() {
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [votingActive, setVotingActive] = useState<boolean>(false);
  const [durationSeconds, setDurationSeconds] = useState<number>(0);
  const [showForm, setShowForm] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [electionAlreadyExists, setElectionAlreadyExists] = useState<boolean>(false);
  const [activePosition, setActivePosition] = useState<string>("President");
  const [activeElectionId, setActiveElectionId] = useState<string | null>(null);
  const [activeElectionTitle, setActiveElectionTitle] = useState<string>("");

  const [allCandidatesFromFirestore, setAllCandidatesFromFirestore] = useState<
    DisplayCandidate[]
  >([]);

  const [electionDetails, setElectionDetails] = useState<ElectionDetails>(
    resetElectionForm()
  );

  const [currentCandidate, setCurrentCandidate] = useState<{
    name: string;
    position: string;
    termDuration: string;
    imageFile: File | null;
  }>(resetCandidateForm());

  const [candidatesList, setCandidatesList] = useState<Candidate[]>([]);

  const [voterStats, setVoterStats] = useState({
    total: 0,    // Only Active members
    voted: 0,    // Only votes from Active members
    notVoted: 0, // Only Active members who haven't voted
  });

  // Navigation hook
  const navigate = useNavigate();

  const handleAdminClick = () => {
    navigate('/EditModal');
  };
  
  // Function to fetch active members count
  const fetchActiveMembers = async () => {
    try {
      const membersSnapshot = await getDocs(collection(db, "members"));
      
      // Count only members with "Active" status
      const activeMembers = membersSnapshot.docs.filter(doc => {
        const memberData = doc.data();
        return memberData.status === "Active"; // Only count Active members
      });
      
      return activeMembers.length;
    } catch (error) {
      console.error("Failed to fetch active members:", error);
      return 0;
    }
  };

  // New function to update remaining time
  const updateRemainingTime = (endTimestamp: Timestamp) => {
    const now = new Date();
    const endTime = endTimestamp.toDate();
    const remaining = Math.floor((endTime.getTime() - now.getTime()) / 1000);
    setDurationSeconds(Math.max(0, remaining));
  };

  const hasTallyBeenCalled = React.useRef(false); 
  
  // The core function for ending the election
  const tallyVotesAndSaveOfficials = async (electionId: string) => {
    if (!electionId) {
      console.error("No active election ID provided for tallying.");
      return;
    }
    if (hasTallyBeenCalled.current) {
        console.warn("Tallying is already in progress or has finished. Aborting redundant call.");
        return; 
    }
    hasTallyBeenCalled.current = true;
    
    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);
      
      // Step 1: Clean up old 'elected_officials' collection
      const oldOfficialsQuery = query(collection(db, "elected_officials"));
      const oldOfficialsSnapshot = await getDocs(oldOfficialsQuery);
      
      oldOfficialsSnapshot.forEach(doc => {
        batch.delete(doc.ref);
      });

      // Step 2: Fetch all candidates for the current election
      const candidatesRef = collection(db, "elections", electionId, "candidates");
      const candidatesSnapshot = await getDocs(candidatesRef);
      const candidates = candidatesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data() as Candidate
      }));

      // Step 3: Fetch all ACTIVE members
      const membersSnapshot = await getDocs(collection(db, "members"));
      const activeMemberIds = membersSnapshot.docs
        .filter(doc => doc.data().status === "Active")
        .map(doc => doc.id);

      // Step 4: Fetch votes but only from active members
      const votesRef = collection(db, "votes");
      const votesQuery = query(votesRef, where("eventId", "==", electionId));
      const votesSnapshot = await getDocs(votesQuery);
      
      const voteCounts = new Map<string, number>();

      votesSnapshot.docs.forEach(doc => {
        const voteData = doc.data();
        const voterId = voteData.userId;
        
        // Only count votes from active members
        if (voterId && activeMemberIds.includes(voterId)) {
          if (voteData.votes && typeof voteData.votes === "object") {
            Object.keys(voteData.votes).forEach((position) => {
              const candidateId = voteData.votes[position]?.candidateId;
              const candidate = candidates.find(c => c.id === candidateId); 
              if (candidate) {
                voteCounts.set(candidate.id, (voteCounts.get(candidate.id) || 0) + 1);
              }
            });
          }
        }
      });

      // Step 5: Determine and save winners (new officials)
      const positions = [...new Set(candidates.map(c => c.position))];
      const electedOfficialsRef = collection(db, "elected_officials");

      for (const position of positions) {
        const candidatesForPosition = candidates.filter(c => c.position === position);
        let winningCandidate: Candidate | null = null;
        let maxVotes = -1;
        let tieCount = 0;

        for (const candidate of candidatesForPosition) {
          const currentVotes = voteCounts.get(candidate.id) || 0;
          
          if (currentVotes > maxVotes) {
            maxVotes = currentVotes;
            winningCandidate = candidate;
            tieCount = 1;
          } else if (currentVotes === maxVotes && currentVotes > 0) { 
            tieCount++; 
          }
        }

        if (winningCandidate && maxVotes > 0 && tieCount === 1) {
          const winnerDocRef = doc(electedOfficialsRef);
          batch.set(winnerDocRef, {
            name: winningCandidate.name,
            position: winningCandidate.position,
            termDuration: winningCandidate.termDuration,
            photoURL: winningCandidate.photoURL,
            votes: maxVotes,
            positionIndex: POSITION_ORDER.indexOf(winningCandidate.position),
          });
        } else {
            console.log(`Skipping saving official for ${position}. Reason: Tie (Count: ${tieCount}) or 0 Votes (Max: ${maxVotes}).`);
        }
      }
      
      // Step 6: Delete the current election and its candidates subcollection
      const electionDocRef = doc(db, "elections", electionId);
      batch.delete(electionDocRef);

      // Execute the atomic operation
      await batch.commit(); 

      console.log("Election ended and officials saved. Election and candidates deleted.");
      setVotingActive(false);
      alert("Election has been successfully ended and results are saved!");
      
      hasTallyBeenCalled.current = false;
      window.location.reload(); 

    } catch (error) {
      console.error("Failed to tally votes or save officials:", error);
      alert("An error occurred while ending the election.");
      hasTallyBeenCalled.current = false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Fetch total ACTIVE voters from Firestore
  useEffect(() => {
    const fetchTotalVoters = async () => {
      const totalActiveMembers = await fetchActiveMembers();
      setVoterStats((prevStats) => ({
        ...prevStats,
        total: totalActiveMembers,
        notVoted: totalActiveMembers - prevStats.voted,
      }));
    };
    fetchTotalVoters();
  }, []);

  // Sync with Firestore for Election Data
  useEffect(() => {
    const electionQuery = query(collection(db, "elections"));

    const unsubscribeElection = onSnapshot(electionQuery, (querySnapshot) => {
      let isElectionFound = false;
      let currentElectionId: string | null = null;
      let electionEndTime: Timestamp | undefined;
      let currentElectionTitle: string = "";

      querySnapshot.forEach((doc) => {
        const electionData = doc.data() as Election;
        const now = new Date();
        const endTime = electionData.endTimestamp?.toDate();
        const remainingTime = endTime ? Math.max(0, Math.floor((endTime.getTime() - now.getTime()) / 1000)) : 0;

        if (remainingTime > 0) {
          isElectionFound = true;
          currentElectionId = doc.id;
          electionEndTime = electionData.endTimestamp;
          currentElectionTitle = electionData.title;
        }
      });

      setElectionAlreadyExists(isElectionFound);
      setActiveElectionId(currentElectionId);
      setActiveElectionTitle(currentElectionTitle);

      if (isElectionFound && electionEndTime) {
        setVotingActive(true);
        updateRemainingTime(electionEndTime);
      } else {
        setVotingActive(false);
        setDurationSeconds(0);
        setActiveElectionTitle("");
      }
    });

    return unsubscribeElection;
  }, []);

  // Timer useEffect for voting duration
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (votingActive) {
      timer = setInterval(() => {
        setDurationSeconds(prevSeconds => {
          if (prevSeconds <= 1) {
            if (activeElectionId) {
              tallyVotesAndSaveOfficials(activeElectionId);
            }
            return 0;
          }
          return prevSeconds - 1;
        });
      }, 1000);
    }
    
    return () => { 
      if (timer) clearInterval(timer);
    };
  }, [votingActive, activeElectionId]);

  // Consolidated useEffect for Candidates and Votes
  useEffect(() => {
    if (!activeElectionId) {
      setAllCandidatesFromFirestore([]);
      setActivePosition("President");
      // Reset to only active members count
      fetchActiveMembers().then(totalActiveMembers => {
        setVoterStats({
          total: totalActiveMembers,
          voted: 0,
          notVoted: totalActiveMembers,
        });
      });
      return;
    }

    const candidatesCollectionRef = collection(db, "elections", activeElectionId, "candidates");
    const votesCollectionRef = collection(db, "votes");

    const unsubscribeCandidates = onSnapshot(candidatesCollectionRef, (candidatesSnapshot) => {
      const candidatesData: DisplayCandidate[] = candidatesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data() as Candidate,
        votes: 0
      }));
      setAllCandidatesFromFirestore(candidatesData);

      // Now, set up the votes listener after candidates are fetched
      const votesQuery = query(votesCollectionRef, where("eventId", "==", activeElectionId));
      
      const unsubscribeVotes = onSnapshot(votesQuery, async (votesSnapshot) => {
        const uniqueVoters = new Set<string>();
        const voteCounts = new Map<string, number>();

        // First, get all active members to validate voters
        const membersSnapshot = await getDocs(collection(db, "members"));
        const activeMemberIds = membersSnapshot.docs
          .filter(doc => doc.data().status === "Active")
          .map(doc => doc.id);

        votesSnapshot.docs.forEach((doc) => {
          const voteData = doc.data();
          const voterId = voteData.userId;
          
          // Only count votes from active members
          if (voterId && activeMemberIds.includes(voterId)) {
            uniqueVoters.add(voterId);
          }

          if (voteData.votes && typeof voteData.votes === "object") {
            Object.keys(voteData.votes).forEach((position) => {
              const candidateId = voteData.votes[position]?.candidateId;
              const candidateInfo = candidatesData.find(c => c.id === candidateId);
              if (candidateInfo) {
                const currentCount = voteCounts.get(candidateInfo.id) || 0;
                voteCounts.set(candidateInfo.id, currentCount + 1);
              }
            });
          }
        });
        
        // Update voter stats - only active members are considered
        const votedCount = uniqueVoters.size;
        const totalActiveMembers = activeMemberIds.length;
        
        setVoterStats({
          total: totalActiveMembers,
          voted: votedCount,
          notVoted: totalActiveMembers - votedCount,
        });

        // Update candidate vote counts
        setAllCandidatesFromFirestore((prevCandidates) => {
          return prevCandidates.map((candidate) => {
            const votes = voteCounts.get(candidate.id) || 0;
            return {
              ...candidate,
              votes: votes,
            };
          });
        });
      });

      return unsubscribeVotes;
    });

    return unsubscribeCandidates;
  }, [activeElectionId]);
  
  const formatDuration = (s: number): string => {
    const hh = Math.floor(s / 3600).toString().padStart(2, "0");
    const mm = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
    const ss = Math.floor(s % 60).toString().padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  };

  const handleElectionChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setElectionDetails((prev) => ({ ...prev, [name]: value }));
  };

  const handleCandidateChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setCurrentCandidate((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCurrentCandidate((prev) => ({ ...prev, imageFile: file }));
    }
  };

  const handleAddCandidateToList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCandidate.name || !currentCandidate.position || !currentCandidate.imageFile) {
      alert("Please fill out all candidate fields and upload an image.");
      return;
    }

    setIsSubmitting(true);
    let photoURL = "";
    try {
      const uniqueFileName = `${Date.now()}_${currentCandidate.imageFile.name}`;
      const storageRef = ref(storage, `candidates/${uniqueFileName}`);
      
      await uploadBytes(storageRef, currentCandidate.imageFile);
      photoURL = await getDownloadURL(storageRef);

      const newCandidate: Candidate = {
        name: currentCandidate.name,
        position: currentCandidate.position,
        termDuration: currentCandidate.termDuration,
        photoURL: photoURL,
      };

      setCandidatesList((prev) => [...prev, newCandidate]);
      setCurrentCandidate(resetCandidateForm());
    } catch (error) {
      console.error("Error uploading image: ", error);
      alert("Failed to upload image. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveElection = async () => {
    if (!electionDetails.title || !candidatesList.length) {
      alert("Please provide an election title and at least one candidate.");
      return;
    }

    setIsSubmitting(true);
    try {
      const electionEndDate = new Date(`${electionDetails.date}T${electionDetails.endTime}`);
      const electionStartDate = new Date(`${electionDetails.date}T${electionDetails.startTime}`);

      if (electionEndDate.getTime() <= electionStartDate.getTime()) {
          alert("End time must be after start time.");
          setIsSubmitting(false);
          return;
      }
      if (electionEndDate.getTime() <= Date.now()) {
          alert("Election must be scheduled in the future.");
          setIsSubmitting(false);
          return;
      }

      const batch = writeBatch(db);
      
      const newElectionRef = doc(collection(db, "elections"));
      
      batch.set(newElectionRef, {
        title: electionDetails.title,
        date: electionDetails.date,
        startTime: electionDetails.startTime,
        endTime: electionDetails.endTime,
        createdAt: new Date(),
        endTimestamp: Timestamp.fromDate(electionEndDate),
      });

      candidatesList.forEach(candidate => {
        const candidateRef = doc(collection(newElectionRef, "candidates"));
        batch.set(candidateRef, candidate);
      });

      await batch.commit();

      console.log("Election and candidates saved with ID: ", newElectionRef.id);
      
      setElectionDetails(resetElectionForm());
      setCandidatesList([]);
      setShowForm(false);
      
      setActiveElectionId(newElectionRef.id); 

    } catch (error) {
      console.error("Error saving election: ", error);
      alert("Failed to save election. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStopVoting = async () => {
    if (!activeElectionId) {
      alert("No active election to stop.");
      return;
    }

    if (!window.confirm("Are you sure you want to end the voting now? This will permanently tally votes and save results.")) {
      return;
    }

    await tallyVotesAndSaveOfficials(activeElectionId);
  };
  
  const filteredCandidates = useMemo(() => {
    return allCandidatesFromFirestore.filter((c) => c.position === activePosition);
  }, [allCandidatesFromFirestore, activePosition]);

  const allPositions = useMemo(() => {
    const positions = allCandidatesFromFirestore.map((c) => c.position);
    return [...new Set(positions)].sort((a, b) => POSITION_ORDER.indexOf(a) - POSITION_ORDER.indexOf(b));
  }, [allCandidatesFromFirestore]);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* UPDATED HEADER - Same as Dashboard */}
      <header className="w-full bg-[#1e4643] text-white shadow-lg p-3 px-6 flex justify-between items-center flex-shrink-0">
        
        {/* Page Title - Left Side */}
        <div className="flex items-center space-x-4">
          <h1 className="text-sm font-Montserrat font-extrabold text-yel ">Election Module</h1>
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
      <main className="flex-1 overflow-auto p-6">
        <div className="space-y-6">
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="bg-object text-gray-100 px-6 py-4 flex items-center justify-between">
              <div className="font-semibold">Election Status</div>
              <div className="flex items-center gap-3">
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="bg-object text-white px-3 py-1 rounded border border-gray-600"
                >
                  <option value={2025}>2025</option>
                  <option value={2024}>2024</option>
                  <option value={2023}>2023</option>
                </select>
                <button
                  onClick={() => setShowForm(true)}
                  className="flex items-center gap-2 bg-emerald-700 text-white px-3 py-1 rounded shadow disabled:bg-gray-500"
                  disabled={electionAlreadyExists}
                >
                  <FiPlus /> New Election
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
                <div className="relative bg-white border rounded shadow-sm px-4 py-4 flex items-center gap-4">
                  <div className="border-l-4 border-amber-400 pl-4">
                    <div className="text-sm text-amber-500">Total Voters</div>
                    <div className="text-2xl font-semibold">
                      {voterStats.total}
                    </div>
                  </div>
                  <div className="ml-auto text-3xl text-amber-400">
                    <FaUsers />
                  </div>
                </div>

                <div className="bg-white border rounded shadow-sm px-4 py-4 flex items-center gap-4">
                  <div className="border-l-4 border-emerald-700 pl-4">
                    <div className="text-sm text-emerald-700">Voted</div>
                    <div className="text-2xl font-semibold">
                      {voterStats.voted}
                    </div>
                  </div>
                  <div className="ml-auto text-3xl text-emerald-700">
                    <FaCheckCircle />
                  </div>
                </div>

                <div className="bg-white border rounded shadow-sm px-4 py-4 flex items-center gap-4">
                  <div className="border-l-4 border-red-500 pl-4">
                    <div className="text-sm text-red-500">Not Voted</div>
                    <div className="text-2xl font-semibold">
                      {voterStats.notVoted}
                    </div>
                  </div>
                  <div className="ml-auto text-3xl text-red-500">
                    <FiXCircle />
                  </div>
                </div>

                <div className="bg-white border rounded shadow-sm px-4 py-4 flex items-center gap-4">
                  <div className="border-l-4 border-gray-400 pl-4">
                    <div className="text-sm text-gray-600">Voting Duration</div>
                    <div className="text-2xl font-semibold">
                      {formatDuration(durationSeconds)}
                    </div>
                  </div>
                  <div className="ml-auto text-3xl text-gray-600">
                    <FiClock />
                  </div>
                </div>
              </div>

              <div className="mt-8 bg-white border rounded shadow-sm flex">
                <aside className="w-48 bg-object text-white p-6">
                  <nav className="flex flex-col gap-6 text-sm">
                    {allPositions.map((position) => (
                      <button
                        key={position}
                        onClick={() => setActivePosition(position)}
                        className={`text-left ${
                          activePosition === position
                            ? "font-bold text-emerald-300"
                            : "text-white hover:text-emerald-300/80 transition"
                        }`}
                      >
                        {position}
                      </button>
                    ))}
                  </nav>
                </aside>

                <div className="flex-1 p-6">
                  <div className="flex items-start justify-between">
                    <h2 className="text-xl font-semibold">
                      {activeElectionTitle 
                        ? `${activeElectionTitle} - ${year}` 
                        : `Voting Count Election ${year}`
                      }
                    </h2>
                    <div>
                      {votingActive && (
                          <button
                            onClick={handleStopVoting}
                            className="flex items-center gap-2 bg-red-600 text-white px-3 py-1 rounded disabled:bg-gray-400"
                            disabled={!votingActive || isSubmitting}
                          >
                            <FiXCircle /> Stop Voting
                          </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 bg-gray-50 border rounded p-8 shadow-inner">
                    {filteredCandidates.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 items-start text-center">
                        {filteredCandidates.map((c) => (
                          <div
                            key={c.id}
                            className="flex flex-col items-center gap-4 bg-white p-4 rounded-lg shadow"
                          >
                            {c.photoURL ? (
                              <img
                                src={c.photoURL}
                                alt={c.name}
                                className="w-40 h-40 rounded-full object-cover border-4 border-emerald-500"
                              />
                            ) : (
                              <div className="w-40 h-40 rounded-full bg-gray-300 flex items-center justify-center text-sm text-gray-500">
                                No Image
                              </div>
                            )}
                            <div className="text-lg font-bold">{c.name}</div>
                            <div className="text-sm text-gray-600 font-medium">{c.position}</div>
                            <div className="w-36 bg-emerald-100 border border-emerald-300 rounded-md py-3 text-2xl font-bold text-emerald-800">
                              {c.votes}
                            </div>
                            <div className="text-sm text-gray-500">Votes</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-gray-500 p-8">
                        {votingActive ? (
                            <>
                              <p className="text-xl font-medium">Walang kandidato para sa posisyon na ito.</p>
                              <p className="text-sm mt-2">Pumili ng ibang posisyon sa kaliwa.</p>
                            </>
                        ) : (
                            <p className="text-xl font-medium">Walang aktibong eleksyon. Pindutin ang "New Election" para magsimula.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl p-6 relative">
            <button
              onClick={() => {
                  setShowForm(false);
                  setCandidatesList([]);
              }}
              className="absolute top-2 right-2 text-gray-600 hover:text-black text-2xl"
            >
              ✕
            </button>

            <h2 className="text-2xl font-bold mb-6 border-b pb-2">
              Create New Election
            </h2>

            <div className="mb-6">
              <h3 className="font-semibold mb-3 text-lg text-emerald-700">Election Details</h3>
              <div className="grid grid-cols-2 gap-6">
                <div className="col-span-2">
                  <label className="block text-sm font-medium">Election Title</label>
                  <input
                    type="text"
                    className="w-full border rounded px-3 py-2 mt-1 focus:border-emerald-500"
                    name="title"
                    value={electionDetails.title}
                    onChange={handleElectionChange}
                    disabled={electionAlreadyExists}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">Election Date</label>
                  <input
                    type="date"
                    className="w-full border rounded px-3 py-2 mt-1 focus:border-emerald-500"
                    name="date"
                    value={electionDetails.date}
                    onChange={handleElectionChange}
                    disabled={electionAlreadyExists}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">Voting Time Duration</label>
                  <div className="flex gap-2 mt-1">
                    <input
                      type="time"
                      className="w-full border rounded px-3 py-2 focus:border-emerald-500"
                      name="startTime"
                      value={electionDetails.startTime}
                      onChange={handleElectionChange}
                      disabled={electionAlreadyExists}
                    />
                    <span className="self-center font-medium">to</span>
                    <input
                      type="time"
                      className="w-full border rounded px-3 py-2 focus:border-emerald-500"
                      name="endTime"
                      value={electionDetails.endTime}
                      onChange={handleElectionChange}
                      disabled={electionAlreadyExists}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="border p-4 rounded-lg bg-gray-50">
              <h3 className="font-semibold mb-3 text-lg text-emerald-700">Add Candidates</h3>
              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-1">
                  <label className="block text-sm font-medium">Candidate Name</label>
                  <input
                    type="text"
                    className="w-full border rounded px-3 py-2 mt-1 focus:border-emerald-500"
                    name="name"
                    value={currentCandidate.name}
                    onChange={handleCandidateChange}
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-sm font-medium">Position</label>
                  <select
                    className="w-full border rounded px-3 py-2 mt-1 focus:border-emerald-500"
                    name="position"
                    value={currentCandidate.position}
                    onChange={handleCandidateChange}
                  >
                    {POSITION_ORDER.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div className="col-span-1">
                  <label className="block text-sm font-medium">Term Duration</label>
                  <input
                    type="text"
                    placeholder="e.g., 2 Years"
                    className="w-full border rounded px-3 py-2 mt-1 focus:border-emerald-500"
                    name="termDuration"
                    value={currentCandidate.termDuration}
                    onChange={handleCandidateChange}
                  />
                </div>
                <div className="col-span-1 relative flex items-center justify-center border-2 border-dashed rounded h-20 bg-white hover:border-emerald-500 transition">
                  <input
                    type="file"
                    accept="image/*"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={handleFileChange}
                  />
                  {currentCandidate.imageFile ? (
                    <img
                      src={URL.createObjectURL(currentCandidate.imageFile)}
                      alt="Preview"
                      className="w-full h-full object-cover rounded"
                    />
                  ) : (
                    <span className="text-gray-500 text-sm">Tap to Add Image</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleAddCandidateToList}
                disabled={isSubmitting || !currentCandidate.name || !currentCandidate.imageFile}
                className="mt-4 bg-emerald-700 text-white px-4 py-2 rounded hover:bg-emerald-800 disabled:bg-gray-400 text-sm"
              >
                {isSubmitting ? "Uploading..." : "+ Add Candidate to List"}
              </button>
            </div>

            {candidatesList.length > 0 && (
              <div className="mt-6 p-4 border rounded bg-white">
                <h4 className="font-semibold mb-2">Candidates Ready for Election:</h4>
                <div className="grid grid-cols-4 gap-4 text-sm">
                    <div className="font-bold">Name</div>
                    <div className="font-bold">Position</div>
                    <div className="font-bold">Term</div>
                    <div className="font-bold">Action</div>
                    {candidatesList.map((c, index) => (
                        <React.Fragment key={index}>
                            <div>{c.name}</div>
                            <div>{c.position}</div>
                            <div>{c.termDuration || "N/A"}</div>
                            <button 
                                onClick={() => setCandidatesList(prev => prev.filter((_, i) => i !== index))}
                                className="text-red-500 hover:text-red-700 text-xs text-left"
                            >
                                Remove
                            </button>
                        </React.Fragment>
                    ))}
                </div>
              </div>
            )}

            <div className="mt-6 text-right pt-4 border-t">
              <button
                onClick={handleSaveElection}
                disabled={isSubmitting || !candidatesList.length || !electionDetails.title || !electionDetails.date}
                className="bg-emerald-700 text-white px-6 py-2 rounded-lg shadow hover:bg-emerald-800 disabled:bg-gray-400"
              >
                {isSubmitting ? "Saving Election..." : "Save and Start Election"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}