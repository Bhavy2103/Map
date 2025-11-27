import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Star, Navigation, Share2, Check } from 'lucide-react';
import { LatLng, Place } from '../types';

// Fix for default Leaflet markers in React/Webpack/Vite environments
const iconUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const iconRetinaUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png';
const shadowUrl = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

const customIcon = new L.Icon({
    iconUrl,
    iconRetinaUrl,
    shadowUrl,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

interface MapComponentProps {
    center: LatLng;
    zoom: number;
    places: Place[];
    userLocation?: LatLng;
    selectedPlaceId?: string;
    onMarkerClick: (place: Place) => void;
    onMapMove?: (center: LatLng, zoom: number) => void;
}

// Helper to check for valid coordinates
const isValidLatLng = (lat: any, lng: any): boolean => {
    return typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng);
};

// Component to handle view updates when props change
const MapUpdater: React.FC<{ center: LatLng; zoom: number; places: Place[] }> = ({ center, zoom, places }) => {
    const map = useMap();
    const prevPlacesRef = useRef<Place[]>([]);
    
    useEffect(() => {
        if (!isValidLatLng(center.lat, center.lng)) return;

        // 1. If places changed (new search results), prioritize fitting bounds
        if (places !== prevPlacesRef.current && places.length > 0) {
            const validPlaces = places.filter(p => isValidLatLng(p.coordinate.lat, p.coordinate.lng));
            if (validPlaces.length > 0) {
                const bounds = L.latLngBounds(validPlaces.map(p => [p.coordinate.lat, p.coordinate.lng]));
                if (bounds.isValid()) {
                    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
                }
            }
            prevPlacesRef.current = places;
        } 
        // 2. Otherwise, check if we need to fly to a new center/zoom
        // This handles "Go to Location" clicks or selecting a marker
        else {
             const currentCenter = map.getCenter();
             const currentZoom = map.getZoom();
             
             // Calculate distance to see if a move is actually required
             // Safety check on map center as well
             if (!isValidLatLng(currentCenter.lat, currentCenter.lng)) return;

             const dist = Math.sqrt(Math.pow(currentCenter.lat - center.lat, 2) + Math.pow(currentCenter.lng - center.lng, 2));
             const isZoomDifferent = currentZoom !== zoom;

             // Threshold to avoid jitters when the update comes from the map itself
             if (dist > 0.0001 || isZoomDifferent) {
                 map.flyTo([center.lat, center.lng], zoom, { duration: 1.5 });
             }
        }
    }, [center, zoom, places, map]);

    return null;
};

// Component to listen to map events and bubble them up
const MapEvents: React.FC<{ onMapMove?: (center: LatLng, zoom: number) => void }> = ({ onMapMove }) => {
    const map = useMapEvents({
        moveend: () => {
            if (onMapMove) {
                const center = map.getCenter();
                const zoom = map.getZoom();
                if (isValidLatLng(center.lat, center.lng)) {
                    onMapMove({ lat: center.lat, lng: center.lng }, zoom);
                }
            }
        },
        zoomend: () => {
             if (onMapMove) {
                const center = map.getCenter();
                const zoom = map.getZoom();
                if (isValidLatLng(center.lat, center.lng)) {
                    onMapMove({ lat: center.lat, lng: center.lng }, zoom);
                }
            }
        }
    });
    return null;
};

// Sub-component for the Popup content to handle Save state independently
const PlacePopup: React.FC<{ place: Place; userLocation?: LatLng }> = ({ place, userLocation }) => {
    const [isSaved, setIsSaved] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const [justCopied, setJustCopied] = useState(false);

    // Identify place uniquely by name + coords since ID is random per session
    const getPlaceKey = (p: Place) => `${p.name}-${p.coordinate.lat.toFixed(5)}-${p.coordinate.lng.toFixed(5)}`;

    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem('saved_places') || '[]');
            const currentKey = getPlaceKey(place);
            const exists = saved.some((p: Place) => getPlaceKey(p) === currentKey);
            setIsSaved(exists);
        } catch (e) {
            console.error("Error reading saved places", e);
        }
    }, [place]);

    const toggleSave = () => {
        setIsAnimating(true);
        setTimeout(() => setIsAnimating(false), 400); // Reset animation state

        try {
            const saved = JSON.parse(localStorage.getItem('saved_places') || '[]');
            const currentKey = getPlaceKey(place);
            let newSaved;

            if (isSaved) {
                // Remove
                newSaved = saved.filter((p: Place) => getPlaceKey(p) !== currentKey);
                setIsSaved(false);
            } else {
                // Add
                newSaved = [...saved, place];
                setIsSaved(true);
            }
            localStorage.setItem('saved_places', JSON.stringify(newSaved));
        } catch (e) {
            console.error("Error saving place", e);
        }
    };

    const handleDirections = () => {
        const dest = `${place.coordinate.lat},${place.coordinate.lng}`;
        let url = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
        // If we have a user location (map center context), use it as origin
        if (userLocation && isValidLatLng(userLocation.lat, userLocation.lng)) {
            const origin = `${userLocation.lat},${userLocation.lng}`;
            url += `&origin=${origin}`;
        }
        window.open(url, '_blank');
    };

    const handleShare = async () => {
        const shareData = {
            title: place.name,
            text: `Check out ${place.name}`,
            url: `https://www.google.com/maps/search/?api=1&query=${place.coordinate.lat},${place.coordinate.lng}`
        };

        try {
            if (navigator.share) {
                await navigator.share(shareData);
            } else {
                // Fallback for desktop/browsers without share API
                await navigator.clipboard.writeText(`${shareData.text}: ${shareData.url}`);
                setJustCopied(true);
                setTimeout(() => setJustCopied(false), 2000);
            }
        } catch (err) {
            console.error("Error sharing:", err);
        }
    };

    return (
        <div className="min-w-[200px] p-0.5">
            <h3 className="font-bold text-slate-800 text-sm mb-1 pr-4 leading-tight">{place.name}</h3>
            <div className="text-[10px] text-slate-500 mb-2 font-mono">
                {place.coordinate.lat.toFixed(4)}, {place.coordinate.lng.toFixed(4)}
            </div>
            
            {place.description && (
                <div className="text-xs text-slate-600 mb-3 leading-snug border-l-2 border-indigo-200 pl-2 py-1 bg-slate-50/50 rounded-r-md">
                    {place.description}
                </div>
            )}
            
            <div className="flex items-center gap-2 mt-2">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleSave();
                    }}
                    className={`
                        flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-300 shadow-sm border
                        ${isSaved 
                            ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100' 
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-indigo-200 hover:text-indigo-600'}
                        ${isAnimating ? 'scale-95' : 'scale-100'}
                    `}
                >
                    <div className={`transition-transform duration-300 ${isAnimating && isSaved ? 'scale-125 rotate-12' : ''}`}>
                        {isSaved ? (
                            <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                        ) : (
                            <Star className="w-3.5 h-3.5" />
                        )}
                    </div>
                    <span>{isSaved ? 'Saved' : 'Save'}</span>
                </button>
                
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        handleShare();
                    }}
                    className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg shadow-sm transition-colors border
                        ${justCopied 
                            ? 'bg-emerald-100 text-emerald-600 border-emerald-200' 
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-indigo-600'
                        }
                    `}
                    title="Share Location"
                >
                    {justCopied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                </button>

                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        handleDirections();
                    }}
                    className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 border border-indigo-700 shadow-sm transition-colors"
                    title="Get Directions from Map Center"
                >
                    <Navigation className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

const MapComponent: React.FC<MapComponentProps> = ({ center, zoom, places, userLocation, selectedPlaceId, onMarkerClick, onMapMove }) => {
    // Ensure center is valid before rendering MapContainer to prevent crashes
    const safeCenter: LatLng = isValidLatLng(center.lat, center.lng) 
        ? center 
        : { lat: 40.7128, lng: -74.0060 }; // Default to NYC if center is invalid

    // Filter places to ensure all have valid coordinates
    const safePlaces = places.filter(p => isValidLatLng(p.coordinate.lat, p.coordinate.lng));

    return (
        <MapContainer 
            center={[safeCenter.lat, safeCenter.lng]} 
            zoom={zoom} 
            scrollWheelZoom={true}
            zoomControl={false}
            className="w-full h-full z-0"
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            />
            
            <MapUpdater center={safeCenter} zoom={zoom} places={safePlaces} />
            <MapEvents onMapMove={onMapMove} />

            {safePlaces.map((place) => (
                <Marker 
                    key={place.id} 
                    position={[place.coordinate.lat, place.coordinate.lng]}
                    icon={customIcon}
                    eventHandlers={{
                        click: (e) => {
                            // Safely handle DOM element access
                            const marker = e.target as L.Marker;
                            if (marker && typeof marker.getElement === 'function') {
                                const element = marker.getElement();
                                
                                // Add animation class if element exists
                                if (element) {
                                    element.classList.add('animate-bounce-custom');
                                }

                                // Delay centering to allow animation to play
                                setTimeout(() => {
                                    if (element) {
                                        element.classList.remove('animate-bounce-custom');
                                    }
                                    onMarkerClick(place);
                                }, 500); 
                            } else {
                                // Fallback if getElement fails (e.g. testing env or edge case)
                                onMarkerClick(place);
                            }
                        },
                    }}
                    opacity={selectedPlaceId && selectedPlaceId !== place.id ? 0.6 : 1}
                >
                    <Popup className="font-sans" closeButton={true}>
                        <PlacePopup place={place} userLocation={userLocation} />
                    </Popup>
                </Marker>
            ))}
        </MapContainer>
    );
};

export default MapComponent;