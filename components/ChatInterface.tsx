import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Loader2, ExternalLink, X, Navigation2, Map as MapIcon, Crosshair, Trash2, ChevronDown, Database, Save, ArrowRight, TrendingUp, History, Star, Plus, Minus } from 'lucide-react';
import { Place, GroundingSource, LatLng } from '../types';

interface SearchOverlayProps {
  isLoading: boolean;
  onSearch: (text: string) => void;
  summary: string;
  places: Place[];
  sources: GroundingSource[];
  onPlaceClick: (place: Place) => void;
  onLocate: (location: LatLng) => void;
  onAddPlace: (place: Place) => void;
  onClear: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onDatabaseViewChange: (isOpen: boolean, places: Place[]) => void;
}

interface SuggestionItem {
    type: 'popular' | 'saved';
    text: string;
    data?: Place;
}

// Lightweight Markdown replacement to avoid CDN dependency issues
const SimpleMarkdown = ({ content }: { content: string }) => {
  if (!content) return null;
  
  // Split by newlines first to handle paragraphs
  const paragraphs = content.split(/\n\n+/);
  
  return (
    <div className="text-slate-600 space-y-2">
      {paragraphs.map((para, idx) => (
        <p key={idx} className="leading-relaxed">
          {para.split(/(\*\*.*?\*\*)/).map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={i} className="font-semibold text-slate-800">{part.slice(2, -2)}</strong>;
            }
            return <span key={i}>{part}</span>;
          })}
        </p>
      ))}
    </div>
  );
};

const POPULAR_SEARCHES = [
    "Coffee shops nearby",
    "Best restaurants",
    "Gas stations",
    "Parks and playgrounds",
    "Hotels",
    "Tourist attractions",
    "Grocery stores",
    "ATM"
];

const SearchOverlay: React.FC<SearchOverlayProps> = ({ 
    isLoading, 
    onSearch, 
    summary, 
    places, 
    sources,
    onPlaceClick,
    onLocate,
    onAddPlace,
    onClear,
    onZoomIn,
    onZoomOut,
    onDatabaseViewChange
}) => {
  const [input, setInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  const [isLocating, setIsLocating] = useState(false);
  const [showDatabase, setShowDatabase] = useState(false);
  const [savedPlaces, setSavedPlaces] = useState<Place[]>([]);
  const [dbMessage, setDbMessage] = useState<string | null>(null);
  
  // Autocomplete State
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Load database content
  const loadDatabase = () => {
      try {
          const saved = JSON.parse(localStorage.getItem('saved_places') || '[]');
          setSavedPlaces(saved);
          return saved;
      } catch (e) {
          console.error("Failed to load database", e);
          return [];
      }
  };

  useEffect(() => {
      if (showDatabase) {
          const places = loadDatabase();
          onDatabaseViewChange(true, places);
      } else {
          onDatabaseViewChange(false, []);
      }
      // Note: onDatabaseViewChange is a prop and might change ref on render, 
      // but logic dictates we only fire this when showDatabase toggles.
  }, [showDatabase]);

  // Click outside to close suggestions
  useEffect(() => {
      function handleClickOutside(event: MouseEvent) {
          if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
              setShowSuggestions(false);
          }
      }
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
          document.removeEventListener("mousedown", handleClickOutside);
      };
  }, []);

  const updateSuggestions = (value: string) => {
      const cleanVal = value.trim().toLowerCase();
      if (!cleanVal) {
          setSuggestions([]);
          return;
      }

      const saved = JSON.parse(localStorage.getItem('saved_places') || '[]');
      
      // Filter Saved Places
      const savedMatches: SuggestionItem[] = saved
          .filter((p: Place) => p.name.toLowerCase().includes(cleanVal))
          .map((p: Place) => ({ type: 'saved', text: p.name, data: p }));

      // Filter Popular Searches
      const popularMatches: SuggestionItem[] = POPULAR_SEARCHES
          .filter(s => s.toLowerCase().includes(cleanVal))
          .map(s => ({ type: 'popular', text: s }));

      // Combine, limiting to 6 total items for clean UI
      setSuggestions([...savedMatches, ...popularMatches].slice(0, 6));
      setShowSuggestions(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setInput(val);
      updateSuggestions(val);
  };

  const handleInputFocus = () => {
      if (input) {
          updateSuggestions(input);
      } else {
          // Show some defaults on empty focus
          const saved = JSON.parse(localStorage.getItem('saved_places') || '[]');
          const recentSaved = saved.slice(-3).reverse().map((p: Place) => ({ type: 'saved', text: p.name, data: p }));
          const popularDefaults = POPULAR_SEARCHES.slice(0, 3).map(s => ({ type: 'popular', text: s }));
          setSuggestions([...recentSaved, ...popularDefaults]);
          setShowSuggestions(true);
      }
  };

  const handleSuggestionClick = (suggestion: SuggestionItem) => {
      setInput(suggestion.text);
      setShowSuggestions(false);
      
      if (suggestion.type === 'saved' && suggestion.data) {
          // If it's a known saved place, go directly there
          onPlaceClick(suggestion.data);
      } else {
          // Otherwise search for it
          onSearch(suggestion.text);
          setIsExpanded(true);
          setShowDatabase(false);
      }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    setShowSuggestions(false);
    onSearch(input);
    setIsExpanded(true);
    setShowDatabase(false);
  };

  const handleClear = () => {
      setInput('');
      onClear();
  };

  const handleCurrentLocationClick = () => {
    setIsLocating(true);
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                // Create a clear name for the location
                const locationName = `My Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
                
                setInput(locationName);
                
                // Create a valid Place object for this location so it can be saved properly
                const currentPlace: Place = {
                    id: `loc-${Date.now()}`,
                    name: locationName,
                    coordinate: { lat, lng },
                    description: "Current user device location"
                };
                
                onAddPlace(currentPlace);
                setIsLocating(false);
                setIsExpanded(true); // Open result card so they can see/save it
                setShowDatabase(false);
            },
            (error) => {
                console.error("Error getting location", error);
                setInput("Error: Could not get location.");
                setIsLocating(false);
            }
        );
    } else {
        setInput("Geolocation is not supported by this browser.");
        setIsLocating(false);
    }
  };

  const handleSaveAllToDatabase = () => {
      try {
          const currentSaved = JSON.parse(localStorage.getItem('saved_places') || '[]');
          let count = 0;
          let lastSavedName = '';
          
          const newSaved = [...currentSaved];
          
          places.forEach(place => {
              // Check for duplicates based on name and generic coordinates
              const exists = newSaved.some((p: Place) => 
                  p.name === place.name && 
                  Math.abs(p.coordinate.lat - place.coordinate.lat) < 0.0001
              );
              
              if (!exists) {
                  newSaved.push(place);
                  count++;
                  lastSavedName = place.name;
              }
          });

          localStorage.setItem('saved_places', JSON.stringify(newSaved));
          
          if (count > 0) {
              setDbMessage(count === 1 ? `Stored "${lastSavedName}" to database` : `Stored ${count} locations to database`);
          } else {
              setDbMessage("Locations already in database");
          }
          
          setTimeout(() => setDbMessage(null), 3000);
          loadDatabase(); // Refresh if open
      } catch (e) {
          console.error("Database write error", e);
          setDbMessage("Error saving data.");
      }
  };

  const removeFromDatabase = (placeId: string, placeName: string) => {
      const updated = savedPlaces.filter(p => p.id !== placeId && p.name !== placeName);
      setSavedPlaces(updated);
      localStorage.setItem('saved_places', JSON.stringify(updated));
      // Update the map immediately
      onDatabaseViewChange(true, updated);
  };

  return (
    <>
    <div className="flex flex-col gap-4 w-full max-w-md pointer-events-auto font-sans" ref={wrapperRef}>
      {/* Top Bar: Search and Tools */}
      <div className="flex gap-2 w-full relative z-50">
        {/* Map Logo / Locate Button */}
        <button
            onClick={handleCurrentLocationClick}
            disabled={isLocating}
            className="flex-shrink-0 w-14 h-14 bg-white hover:bg-slate-50 text-slate-600 rounded-2xl shadow-xl shadow-slate-200 flex items-center justify-center transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed group border border-slate-200"
            title="Use Current Location"
        >
            {isLocating ? (
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            ) : (
                <MapIcon className="w-6 h-6 group-hover:hidden" />
            )}
            {!isLocating && <Crosshair className="hidden group-hover:block w-6 h-6 text-indigo-600" />}
        </button>

        {/* Search Input */}
        <div className="relative flex-grow group">
            <form onSubmit={handleSubmit} className="relative w-full">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search className={`w-5 h-5 ${isLoading ? 'text-indigo-500' : 'text-slate-400'}`} />
                </div>
                <input
                    type="text"
                    value={input}
                    onChange={handleInputChange}
                    onFocus={handleInputFocus}
                    placeholder="Search map..."
                    className="block w-full h-14 pl-11 pr-14 bg-white/95 backdrop-blur-sm border-0 rounded-2xl text-slate-900 shadow-xl shadow-slate-200/50 ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400 transition-all text-base font-medium"
                    autoComplete="off"
                />
                <button 
                    type="submit"
                    disabled={isLoading || !input.trim()}
                    className="absolute right-2 top-2 bottom-2 bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-600 px-4 rounded-xl font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Go'}
                </button>
            </form>

            {/* Autocomplete Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
                <ul className="absolute top-full left-0 right-0 mt-2 bg-white/95 backdrop-blur-md rounded-xl shadow-2xl ring-1 ring-black/5 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50 border-b border-slate-100">
                        Suggestions
                    </div>
                    {suggestions.map((item, index) => (
                        <li key={index}>
                            <button
                                onClick={() => handleSuggestionClick(item)}
                                className="w-full text-left px-4 py-3 hover:bg-indigo-50 flex items-center gap-3 transition-colors group border-b border-slate-50 last:border-0"
                            >
                                {item.type === 'saved' ? (
                                    <div className="p-1.5 bg-amber-100 text-amber-600 rounded-md shrink-0">
                                        <Star className="w-4 h-4 fill-amber-600" />
                                    </div>
                                ) : (
                                    <div className="p-1.5 bg-slate-100 text-slate-500 rounded-md shrink-0 group-hover:bg-indigo-100 group-hover:text-indigo-600">
                                        <TrendingUp className="w-4 h-4" />
                                    </div>
                                )}
                                <div className="flex-1 overflow-hidden">
                                    <span className={`block truncate text-sm ${item.type === 'saved' ? 'font-semibold text-slate-700' : 'font-medium text-slate-600'}`}>
                                        {item.text}
                                    </span>
                                    {item.type === 'saved' && (
                                        <span className="text-[10px] text-slate-400">Saved Location</span>
                                    )}
                                </div>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>

        {/* Database Toggle Button */}
        <button
            onClick={() => {
                setShowDatabase(!showDatabase);
                if (!showDatabase) setIsExpanded(false); // Close results if opening DB
            }}
            className={`flex-shrink-0 w-14 h-14 rounded-2xl shadow-xl shadow-slate-200 flex items-center justify-center transition-all active:scale-95 border 
                ${showDatabase 
                    ? 'bg-indigo-600 border-indigo-600 text-white' 
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            title="Open Saved Database"
        >
            <Database className="w-6 h-6" />
        </button>
      </div>

      {/* Database View Overlay */}
      {showDatabase && (
          <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl ring-1 ring-slate-200 overflow-hidden max-h-[60vh] flex flex-col animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <div className="flex items-center gap-2 text-indigo-800">
                      <Database className="w-4 h-4" />
                      <span className="text-sm font-bold uppercase tracking-wider">My Database</span>
                  </div>
                  <button onClick={() => setShowDatabase(false)} className="text-slate-400 hover:text-slate-600">
                      <X className="w-5 h-5" />
                  </button>
              </div>
              
              <div className="overflow-y-auto p-2 scrollbar-thin">
                  {savedPlaces.length === 0 ? (
                      <div className="text-center p-8 text-slate-400">
                          <Database className="w-12 h-12 mx-auto mb-3 opacity-20" />
                          <p className="text-sm">Database is empty.</p>
                          <p className="text-xs mt-1">Search for places and click 'Save' to add them here.</p>
                      </div>
                  ) : (
                      <div className="space-y-2">
                          {savedPlaces.map((place, idx) => (
                              <div key={idx} className="bg-white border border-slate-100 p-3 rounded-xl flex items-center justify-between hover:shadow-sm hover:border-indigo-200 transition-all group">
                                  <div 
                                    className="flex items-center gap-3 flex-grow cursor-pointer"
                                    onClick={() => {
                                        onPlaceClick(place);
                                    }}
                                  >
                                      <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                          <MapPin className="w-4 h-4" />
                                      </div>
                                      <div>
                                          <h4 className="font-medium text-slate-700 text-sm">{place.name}</h4>
                                          <p className="text-[10px] text-slate-400 font-mono">
                                              {place.coordinate.lat.toFixed(3)}, {place.coordinate.lng.toFixed(3)}
                                          </p>
                                      </div>
                                  </div>
                                  <button 
                                      onClick={() => removeFromDatabase(place.id, place.name)}
                                      className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                      title="Delete from Database"
                                  >
                                      <Trash2 className="w-4 h-4" />
                                  </button>
                              </div>
                          ))}
                      </div>
                  )}
              </div>
              <div className="p-3 bg-slate-50 border-t border-slate-100 text-center">
                  <span className="text-xs text-slate-400 font-medium">
                      {savedPlaces.length} records stored locally
                  </span>
              </div>
          </div>
      )}

      {/* Results Card */}
      {summary && isExpanded && !showDatabase && (
        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl ring-1 ring-slate-200 overflow-hidden max-h-[60vh] flex flex-col animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="p-4 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
                <div className="flex items-center gap-2 text-indigo-600">
                    <MapPin className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Results</span>
                </div>
                <div className="flex gap-1">
                     {/* Save All Button */}
                    <button 
                        onClick={handleSaveAllToDatabase}
                        className="flex items-center gap-1 text-emerald-600 hover:text-emerald-700 px-2 py-1.5 hover:bg-emerald-50 rounded-lg transition mr-1"
                        title="Save all results to Database"
                    >
                        <Save className="w-4 h-4" />
                        <span className="text-xs font-bold">Save All</span>
                    </button>

                    <button 
                        onClick={handleClear}
                        className="text-slate-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-lg transition"
                        title="Clear Results"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={() => setIsExpanded(false)}
                        className="text-slate-400 hover:text-indigo-600 p-1.5 hover:bg-indigo-50 rounded-lg transition"
                        title="Minimize"
                    >
                        <ChevronDown className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Notification Toast inside Card */}
            {dbMessage && (
                <div className="bg-emerald-50 text-emerald-700 px-4 py-2 text-xs font-medium text-center border-b border-emerald-100 flex items-center justify-center gap-2">
                    <Star className="w-3 h-3 fill-emerald-600" />
                    {dbMessage}
                </div>
            )}
            
            <div className="overflow-y-auto p-5 scrollbar-thin">
                {/* AI Summary */}
                <div className="prose prose-sm prose-slate max-w-none mb-6">
                    <SimpleMarkdown content={summary} />
                </div>

                {/* Places List */}
                {places.length > 0 && (
                    <div className="space-y-3 mb-6">
                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Locations Found</h3>
                        {places.map((place) => (
                            <button
                                key={place.id}
                                onClick={() => onPlaceClick(place)}
                                className="w-full text-left group bg-white border border-slate-200 p-3 rounded-xl hover:border-indigo-300 hover:shadow-md transition-all flex items-center justify-between"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                                        <MapPin className="w-4 h-4" />
                                    </div>
                                    <span className="font-medium text-slate-700 group-hover:text-indigo-700">{place.name}</span>
                                </div>
                                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500" />
                            </button>
                        ))}
                    </div>
                )}

                {/* Sources */}
                {sources.length > 0 && (
                    <div className="pt-4 border-t border-slate-100">
                        <div className="flex flex-wrap gap-2">
                            {sources.map((source, idx) => (
                                <a 
                                    key={idx} 
                                    href={source.uri} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-indigo-500 bg-slate-50 hover:bg-indigo-50 px-2 py-1 rounded-md transition-colors"
                                >
                                    <ExternalLink className="w-3 h-3" />
                                    <span className="max-w-[150px] truncate">{source.title}</span>
                                </a>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
      )}
      
      {/* Minimized View */}
      {summary && !isExpanded && !showDatabase && (
          <div className="flex gap-2">
            <button 
                onClick={() => setIsExpanded(true)}
                className="self-start bg-white text-indigo-600 px-4 py-2 rounded-xl shadow-lg font-medium text-sm flex items-center gap-2 hover:bg-indigo-50 transition border border-slate-200"
            >
                <MapPin className="w-4 h-4" />
                Show Results
            </button>
            <button 
                onClick={handleClear}
                className="self-start bg-white text-slate-500 px-3 py-2 rounded-xl shadow-lg font-medium text-sm flex items-center justify-center hover:bg-red-50 hover:text-red-600 transition border border-slate-200"
                title="Clear Results"
            >
                <Trash2 className="w-4 h-4" />
            </button>
          </div>
      )}
    </div>

    {/* Custom Animated Zoom Controls */}
    <div className="absolute bottom-6 right-6 flex flex-col gap-2 pointer-events-auto z-50">
        <button 
            onClick={onZoomIn}
            className="w-12 h-12 bg-white rounded-xl shadow-xl border border-slate-100 flex items-center justify-center text-slate-700 hover:text-indigo-600 hover:bg-indigo-50 transition-all active:scale-90 hover:scale-105"
            title="Zoom In"
        >
            <Plus className="w-6 h-6" />
        </button>
        <button 
            onClick={onZoomOut}
            className="w-12 h-12 bg-white rounded-xl shadow-xl border border-slate-100 flex items-center justify-center text-slate-700 hover:text-indigo-600 hover:bg-indigo-50 transition-all active:scale-90 hover:scale-105"
            title="Zoom Out"
        >
            <Minus className="w-6 h-6" />
        </button>
    </div>
    </>
  );
};

export default SearchOverlay;