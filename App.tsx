import React, { useState, useEffect, useRef } from 'react';
import MapComponent from './components/MapComponent';
import SearchOverlay from './components/ChatInterface'; // Refactored component
import { sendMessageToGemini } from './services/geminiService';
import { LatLng, Place, DEFAULT_CENTER, DEFAULT_ZOOM, GroundingSource } from './types';
import { Crosshair } from 'lucide-react';

const App: React.FC = () => {
  const [places, setPlaces] = useState<Place[]>([]);
  const [summary, setSummary] = useState<string>("");
  const [sources, setSources] = useState<GroundingSource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<LatLng | undefined>(undefined);
  
  // Map State
  const [mapCenter, setMapCenter] = useState<LatLng>(DEFAULT_CENTER);
  const [mapZoom, setMapZoom] = useState<number>(DEFAULT_ZOOM);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | undefined>(undefined);
  
  // Store previous view state to restore on clear
  const [previousViewState, setPreviousViewState] = useState<{center: LatLng, zoom: number} | null>(null);

  // Backup for search results when switching to Database view
  const searchResultsBackup = useRef<{places: Place[], summary: string, sources: GroundingSource[]} | null>(null);

  // Get User Location on Mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setUserLocation(loc);
          setMapCenter(loc);
        },
        (error) => {
          console.warn("Geolocation denied or error:", error);
        }
      );
    }
  }, []);

  const handleSearch = async (query: string) => {
    // Save current state before searching
    setPreviousViewState({ center: mapCenter, zoom: mapZoom });
    
    // Clear backup since we are doing a new search
    searchResultsBackup.current = null;

    setIsLoading(true);
    setSummary(""); 
    setPlaces([]);
    setSources([]);
    setSelectedPlaceId(undefined);

    try {
      const response = await sendMessageToGemini(query, userLocation);
      
      setSummary(response.text);
      setPlaces(response.places);
      setSources(response.sources);

    } catch (error) {
      console.error(error);
      setSummary("Sorry, I couldn't find that place. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setPlaces([]);
    setSummary("");
    setSources([]);
    setSelectedPlaceId(undefined);
    searchResultsBackup.current = null;
    
    // Restore previous map view if available
    if (previousViewState) {
      setMapCenter(previousViewState.center);
      setMapZoom(previousViewState.zoom);
    }
  };

  const handlePlaceClick = (place: Place) => {
    setMapCenter(place.coordinate);
    setMapZoom(16);
    setSelectedPlaceId(place.id);
  };

  // Used for moving map without creating a marker
  const handleManualLocate = (location: LatLng) => {
    setUserLocation(location);
    setMapCenter(location);
    setMapZoom(16);
  };

  // Used for manually adding a place (e.g., Current Location button)
  const handleAddPlace = (place: Place) => {
    setPreviousViewState({ center: mapCenter, zoom: mapZoom });
    searchResultsBackup.current = null;
    
    setPlaces([place]);
    setSummary(`**${place.name}**\n\nDevice location found.`);
    setSources([]);
    
    setUserLocation(place.coordinate);
    setMapCenter(place.coordinate);
    setMapZoom(16);
    setSelectedPlaceId(place.id);
  };

  const handleMapMove = (newCenter: LatLng, newZoom: number) => {
    // When the user drags/zooms the map, we update the userLocation and map state.
    // This allows the next search to be contextually aware of where the user is looking.
    setUserLocation(newCenter);
    setMapCenter(newCenter);
    setMapZoom(newZoom);
  };

  const handleZoomIn = () => {
      setMapZoom(prev => Math.min(prev + 1, 18));
  };

  const handleZoomOut = () => {
      setMapZoom(prev => Math.max(prev - 1, 3));
  };

  // Switch between Search Results and Saved Database items
  const handleDatabaseViewChange = (isOpen: boolean, dbPlaces: Place[]) => {
      if (isOpen) {
          // Backup current search if we haven't already (and if we aren't already in DB mode)
          if (!searchResultsBackup.current) {
              searchResultsBackup.current = {
                  places,
                  summary,
                  sources
              };
          }
          // Show DB places
          setPlaces(dbPlaces);
          // Hide summary/sources while in DB mode (optional, handled by UI overlay mostly)
          // We keep summary/sources in state but the UI hides them. 
          // However, for clean map interactions, we only want DB markers.
      } else {
          // Restore search results
          if (searchResultsBackup.current) {
              setPlaces(searchResultsBackup.current.places);
              setSummary(searchResultsBackup.current.summary);
              setSources(searchResultsBackup.current.sources);
              searchResultsBackup.current = null;
          } else {
              // If no backup, just clear
              setPlaces([]);
              setSummary("");
              setSources([]);
          }
      }
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-slate-100">
      
      {/* Full Screen Map Layer */}
      <div className="absolute inset-0 z-0">
        <MapComponent 
            center={mapCenter} 
            zoom={mapZoom} 
            places={places}
            selectedPlaceId={selectedPlaceId}
            userLocation={userLocation}
            onMarkerClick={handlePlaceClick}
            onMapMove={handleMapMove}
        />
      </div>

      {/* Center Crosshair Indicator */}
      <div className="absolute inset-0 pointer-events-none z-0 flex items-center justify-center">
        <div className="text-slate-500/80 drop-shadow-md">
            <Crosshair className="w-8 h-8 opacity-75" strokeWidth={1.5} />
        </div>
      </div>

      {/* Floating Search & Results Overlay & Zoom Controls */}
      <div className="absolute inset-0 z-10 pointer-events-none p-4 md:p-6 flex flex-col items-start justify-start">
        <SearchOverlay 
            isLoading={isLoading} 
            onSearch={handleSearch}
            summary={summary}
            places={places}
            sources={sources}
            onPlaceClick={handlePlaceClick}
            onLocate={handleManualLocate}
            onAddPlace={handleAddPlace}
            onClear={handleClear}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onDatabaseViewChange={handleDatabaseViewChange}
        />
      </div>
    </div>
  );
};

export default App;