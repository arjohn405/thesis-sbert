import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import styles from '../styles/Recommendations.module.css';
import MetricsExplanation from '../components/MetricsExplanation';

interface Hackathon {
  title: string;
  description: string;
  requirements: string[];
  prize: string;
  criteria: string;
  deadline: string;
  keywords: string[];
  match_score: number;
  evaluation_metrics: {
    precision: number;
    recall: number;
    f1_score: number;
    cosine_similarity: number;
    accuracy: number;
  };
  skill_matches: {
    [key: string]: Array<[string, number]>;
  };
  originalDescription?: string;
  embedding?: number[];
  description_embedding?: number[];
  embeddings?: number[];
  vector?: number[];
  text_embedding?: number[];
  Countdown?: string[] | string;
  KeywordsFromCSV?: string[];
}

interface User {
  id: number;
  username: string;
  skills: string[];
  email: string;
}

export default function Recommendations() {
  const router = useRouter();
  const [recommendations, setRecommendations] = useState<Hackathon[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedHackathon, setSelectedHackathon] = useState<Hackathon | null>(null);
  const [showMetrics, setShowMetrics] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Helper function to format match score percentage
  const formatMatchScore = (score: number): string => {
    // Cap at 100%
    const cappedScore = Math.min(score, 1) * 100;
    // Format with up to 2 decimal places
    const formatted = cappedScore.toFixed(2);
    // Remove trailing zeros and decimal point if not needed
    return parseFloat(formatted).toString() + '%';
  };

  // Helper function to calculate and format countdown
  const getCountdown = (deadlineStr: string): string => {
    if (!deadlineStr) return 'No deadline specified';
    
    try {
      // Try different formats
      let deadlineDate: Date | null = null;
      
      // Try ISO format
      if (deadlineStr.includes('T') || deadlineStr.includes('-')) {
        deadlineDate = new Date(deadlineStr);
      } else if (deadlineStr.includes('/')) {
        // Try MM/DD/YYYY format
        const parts = deadlineStr.split('/');
        if (parts.length === 3) {
          deadlineDate = new Date(`${parts[2]}-${parts[0]}-${parts[1]}`);
        }
      }
      
      // If we couldn't parse the date or it's invalid
      if (!deadlineDate || isNaN(deadlineDate.getTime())) {
        return deadlineStr; // Return original string
      }
      
      // Calculate difference in milliseconds
      const diff = deadlineDate.getTime() - currentTime.getTime();
      
      // Return if deadline has passed
      if (diff <= 0) return 'Deadline passed';
      
      // Calculate days, hours, minutes
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      
      if (days > 0) {
        return `${days} day${days !== 1 ? 's' : ''} left`;
      } else if (hours > 0) {
        return `${hours} hour${hours !== 1 ? 's' : ''} left`;
      } else {
        return `${minutes} minute${minutes !== 1 ? 's' : ''} left`;
      }
    } catch (e) {
      return deadlineStr; // Return original string if any error occurs
    }
  };

  // Generate countdown info if not available from the API
  const getCountdownInfo = (hackathon: Hackathon): string[] => {
    // If we have Countdown data from the API, use it
    if (hackathon.Countdown && Array.isArray(hackathon.Countdown) && hackathon.Countdown.length > 0) {
      return hackathon.Countdown;
    }
    
    // Otherwise, return an empty array to hide this section since we show countdown in the footer
    return [];
  };

  // Get keywords from CSV if available
  const getKeywordsFromCSV = (hackathon: Hackathon): string[] => {
    // If we have KeywordsFromCSV data from the API, use it
    if (hackathon.KeywordsFromCSV && Array.isArray(hackathon.KeywordsFromCSV) && hackathon.KeywordsFromCSV.length > 0) {
      return hackathon.KeywordsFromCSV;
    }
    
    // Return empty array if no CSV keywords are available
    return [];
  };

  // Update currentTime every minute to keep countdown accurate
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    
    return () => clearInterval(timer);
  }, []);

  // Helper function to estimate token count
  const estimateTokenCount = (text: string | undefined): number => {
    if (!text) return 0;
    // Rough approximation: split by whitespace and punctuation
    return text.split(/[\s,.;:!?()\[\]{}""'']+/).filter(Boolean).length;
  };

  // CSV export function
  const exportToCSV = () => {
    if (!recommendations || recommendations.length === 0) return;
    
    // Define CSV headers and content
    const headers = [
      'Title',
      'Description',
      'Description Truncated',
      'original_token_count',
      'truncated_token_count',
      'Embedding Available',
      'Match Score',
      'Precision',
      'Recall',
      'F1 Score',
      'Accuracy',
      'Cosine Similarity',
      'Requirements'
    ].join(',');
    
    // Format each row of data
    const rows = recommendations.map(hackathon => {
      // Sanitize description (remove commas and quotes)
      const safeDescription = hackathon.description
        ? `"${hackathon.description.replace(/"/g, '""')}"`
        : '""';
      
      // Determine if description is truncated - simplify to avoid regex issues
      const isDescriptionTruncated = 
        (hackathon.description && (
          hackathon.description.endsWith('...') || 
          hackathon.description.endsWith('…') ||
          hackathon.description.length >= 200  // Assume long descriptions are likely truncated
        )) ? 'true' : 'false';
      
      // Calculate token counts
      const displayedTokenCount = estimateTokenCount(hackathon.description);
      
      // Estimate original token count (if truncated, actual count would be higher)
      const originalTokenCount = isDescriptionTruncated === 'true' && hackathon.originalDescription
        ? estimateTokenCount(hackathon.originalDescription)
        : displayedTokenCount;
      
      // Handle embeddings - check multiple possible embedding fields
      let embedding: number[] = [];
      
      // Try to access embedding from any possible source with more comprehensive checks
      if (hackathon.embedding && Array.isArray(hackathon.embedding) && hackathon.embedding.length > 0) {
        embedding = hackathon.embedding;
      } else if (hackathon.description_embedding && Array.isArray(hackathon.description_embedding) && hackathon.description_embedding.length > 0) {
        embedding = hackathon.description_embedding;
      } else if (hackathon.embeddings && Array.isArray(hackathon.embeddings) && hackathon.embeddings.length > 0) {
        embedding = hackathon.embeddings;
      } else if (hackathon.vector && Array.isArray(hackathon.vector) && hackathon.vector.length > 0) {
        embedding = hackathon.vector;
      } else if (hackathon.text_embedding && Array.isArray(hackathon.text_embedding) && hackathon.text_embedding.length > 0) {
        embedding = hackathon.text_embedding;
      }
      
      // Flag if embedding is available
      const hasEmbedding = embedding.length > 0 ? 'true' : 'false';
      
      // Format requirements as single string with semicolons
      const requirements = hackathon.requirements
        ? `"${hackathon.requirements.join('; ')}"`
        : '""';
        
      return [
        `"${hackathon.title.replace(/"/g, '""')}"`,
        safeDescription,
        isDescriptionTruncated,
        originalTokenCount,
        displayedTokenCount,
        hasEmbedding,
        parseFloat((Math.min(hackathon.match_score, 1) * 100).toFixed(2)),
        parseFloat((hackathon.evaluation_metrics.precision * 100).toFixed(2)),
        parseFloat((hackathon.evaluation_metrics.recall * 100).toFixed(2)),
        parseFloat((hackathon.evaluation_metrics.f1_score * 100).toFixed(2)),
        parseFloat((hackathon.evaluation_metrics.accuracy * 100).toFixed(2)),
        parseFloat((hackathon.evaluation_metrics.cosine_similarity * 100).toFixed(2)),
        requirements
      ].join(',');
    });
    
    // Combine headers and rows
    const csvContent = `${headers}\n${rows.join('\n')}`;
    
    // Create a blob and download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    // Set download attributes
    const date = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `hackathon-recommendations-${date}.csv`);
    link.style.visibility = 'hidden';
    
    // Append to body, click and remove
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const fetchUserData = async (userId: string) => {
    try {
      const response = await fetch(`http://localhost:8000/users/${userId}`);
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      }
    } catch (err) {
      console.error('Error fetching user data:', err);
    }
  };

  const fetchRecommendations = async () => {
    const userId = localStorage.getItem('userId');
    if (!userId) {
      router.push('/login');
      return;
    }

    try {
      await fetchUserData(userId);
      const response = await fetch(`http://localhost:8000/recommendations/${userId}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch recommendations');
      }
      
      const data = await response.json();
      setRecommendations(data);
    } catch (err: any) {
      console.error('Error fetching recommendations:', err);
      setError(err.message || 'Failed to load recommendations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const userId = localStorage.getItem('userId');
    if (!userId) {
      router.push('/login');
      return;
    }
    fetchRecommendations();
  }, []); // Empty dependency array to run only once on mount

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchRecommendations().finally(() => {
      setIsRefreshing(false);
    });
  };

  const saveAndNavigateToHackathon = (hackathon: Hackathon, index: number) => {
    localStorage.setItem('hackathons', JSON.stringify(recommendations));
    router.push(`/hackathon/${index}`);
  };

  if (loading && !isRefreshing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="container mx-auto px-4 py-8 min-h-screen bg-gray-50"
    >
      <div className="flex justify-between items-center mb-8">
        <motion.h1 
          initial={{ x: -20 }}
          animate={{ x: 0 }}
          className="text-3xl font-bold text-gray-800"
        >
          Traditional Hackathon Recommendations with SBert Model
        </motion.h1>
        <div className="flex items-center gap-4">
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Link 
              href="/profile" 
              className="flex items-center gap-2 px-4 py-2 text-blue-500 hover:text-blue-700 transition-colors duration-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Profile
            </Link>
          </motion.div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg
                     hover:bg-blue-600 transition-colors duration-200 disabled:opacity-50"
          >
            {isRefreshing ? (
              <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            Refresh
          </motion.button>
        </div>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4"
        >
          {error}
        </motion.div>
      )}

      <div className="flex flex-col md:flex-row gap-6">
        {/* User Profile Sidebar */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="md:w-1/4 bg-white rounded-xl shadow-md h-fit"
        >
          {user ? (
            <div className="p-6">
              <div className="flex items-center mb-4">
                <div className="bg-blue-500 text-white rounded-full w-14 h-14 flex items-center justify-center text-2xl font-bold">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div className="ml-4">
                  <h2 className="text-xl font-bold text-gray-800">{user.username}</h2>
                  <p className="text-sm text-gray-600">{user.email}</p>
                </div>
              </div>
              
              <div className="border-t border-gray-100 pt-4">
                <h3 className="font-semibold text-gray-700 mb-2">Your Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {user.skills && user.skills.length > 0 ? (
                    user.skills.map((skill, index) => (
                      <span 
                        key={index}
                        className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs"
                      >
                        {skill}
                      </span>
                    ))
                  ) : (
                    <p className="text-gray-500 italic text-sm">No skills added yet</p>
                  )}
                </div>
              </div>
              
              <div className="mt-6">
                <Link 
                  href="/settings" 
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg
                           hover:bg-gray-200 transition-colors duration-200 text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Edit Profile
                </Link>
                
                <button
                  onClick={exportToCSV}
                  className="w-full mt-3 inline-flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg
                           hover:bg-green-700 transition-colors duration-200 text-sm"
                  disabled={recommendations.length === 0}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export to CSV
                </button>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center">
              <div className="animate-pulse bg-gray-200 rounded-full w-14 h-14 mx-auto mb-4"></div>
              <div className="animate-pulse bg-gray-200 h-4 w-3/4 mx-auto mb-2 rounded"></div>
              <div className="animate-pulse bg-gray-200 h-3 w-1/2 mx-auto rounded"></div>
            </div>
          )}
        </motion.div>

        {/* Main Content */}
        <div className="md:w-3/4">
          <div className="grid grid-cols-1 gap-6">
            {recommendations.map((hackathon, index) => (
              <motion.div
                key={index}
                className={`${styles.hackathonCard} transform transition-all duration-200`}
              >
                <div className="flex justify-between items-start">
                  <h2 className="text-xl font-bold mb-2 text-gray-800">{hackathon.title}</h2>
                  <span className={`${styles.matchBadge} ${
                    hackathon.match_score > 0.7 ? styles.matchBadgeHigh :
                    hackathon.match_score > 0.4 ? styles.matchBadgeMedium :
                    styles.matchBadgeLow
                  }`}>
                    Match: {formatMatchScore(hackathon.match_score)}
                  </span>
                </div>
                
                <p className="text-gray-600 mb-4 line-clamp-3">{hackathon.description}</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  {/* Countdown section */}
                  <div>
                    <h3 className="font-semibold mb-2 text-gray-700">Countdown:</h3>
                    <div className="flex flex-wrap gap-2">
                      {hackathon.Countdown && hackathon.Countdown.length > 0 ? (
                        Array.isArray(hackathon.Countdown) 
                          ? hackathon.Countdown.map((item: string, index: number) => (
                              <span key={index} className={styles.skillTag}>
                                {item.trim()}
                              </span>
                            ))
                          : hackathon.Countdown.split(',').map((item: string, index: number) => (
                              <span key={index} className={styles.skillTag}>
                                {item.trim()}
                              </span>
                            ))
                      ) : (
                        <span className={styles.skillTag}>
                          No countdown info available
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Keywords section */}
                  <div>
                    <h3 className="font-semibold mb-2 text-gray-700">Keywords:</h3>
                    <div className="flex flex-wrap gap-2">
                      {(() => {
                        const csvKeywords = getKeywordsFromCSV(hackathon);
                        if (csvKeywords && csvKeywords.length > 0) {
                          return csvKeywords.slice(0, 5).map((keyword, idx) => (
                            <span key={idx} className={styles.skillTag}>
                              {keyword}
                            </span>
                          ));
                        } else if (hackathon.keywords && Array.isArray(hackathon.keywords) && hackathon.keywords.length > 0) {
                          return (
                            <>
                              {hackathon.keywords.slice(0, 5).map((keyword, idx) => (
                                <span key={idx} className={styles.skillTag}>
                                  {keyword}
                                </span>
                              ))}
                              <span className="text-xs text-gray-500 italic">(using original keywords)</span>
                            </>
                          );
                        } else {
                          return (
                            <p className="text-sm text-gray-500 italic">No keywords specified</p>
                          );
                        }
                      })()}
                    </div>
                  </div>
                </div>
                
                {/* Footer with deadline and metrics button */}
                <div className="flex justify-between items-center mt-4 border-t border-gray-100 pt-3">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-sm font-medium text-orange-600">
                        Deadline Date: {hackathon.deadline || 'Not specified'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedHackathon(hackathon);
                        setShowMetrics(true);
                      }}
                      className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 
                               transition-colors duration-200 text-sm font-medium flex items-center gap-1.5"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      View Metrics
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => saveAndNavigateToHackathon(hackathon, index)}
                      className="px-3 py-1.5 text-blue-500 hover:text-blue-700 font-medium text-sm"
                    >
                      View Details →
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {recommendations.length === 0 && !loading && !error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12"
            >
              <p className="text-gray-600 text-lg">No recommendations found. Try updating your skills!</p>
              <Link
                href="/settings"
                className="inline-block mt-4 text-blue-500 hover:text-blue-700 font-medium"
              >
                Update Skills →
              </Link>
            </motion.div>
          )}
        </div>
      </div>

      {selectedHackathon && (
        <MetricsExplanation
          isOpen={showMetrics}
          onClose={() => {
            setShowMetrics(false);
            setSelectedHackathon(null);
          }}
          metrics={selectedHackathon.evaluation_metrics}
          skill_matches={selectedHackathon.skill_matches}
        />
      )}
    </motion.div>
  );
} 