import { useState, useEffect } from 'react';

// Reusable component for the loading spinner
function Loader({ size = 'w-10 h-10' }) {
    return (
        <div className={`loader animate-spin rounded-full border-4 border-gray-200 border-t-blue-500 ${size}`}></div>
    );
}

// Main Application Component
export default function App() {
    // State management for the entire application
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [loginError, setLoginError] = useState('');
    
    // Form inputs
    const [siteUrl, setSiteUrl] = useState('https://world.hyrosy.com');
    const [username, setUsername] = useState('');
    const [appPassword, setAppPassword] = useState('');

    // Data from the API
    const [bookings, setBookings] = useState([]);
    const [enquiries, setEnquiries] = useState([]);
    const [currentUsername, setCurrentUsername] = useState('');
    const [userId, setUserId] = useState(null);

    // Effect to check for stored login info on initial load
    useEffect(() => {
        const storedAuth = localStorage.getItem('providerAuth');
        if (storedAuth) {
            const auth = JSON.parse(storedAuth);
            setSiteUrl(auth.siteUrl);
            setCurrentUsername(auth.username);
            setUserId(auth.userId);
            setIsLoggedIn(true);
        }
        setIsLoading(false); // Finish initial loading check
    }, []);
    
    // Effect to fetch data whenever isLoggedIn state changes to true
    useEffect(() => {
        if (isLoggedIn) {
            fetchData();
        }
    }, [isLoggedIn]);


    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setLoginError('');

        if (!siteUrl || !username || !appPassword) {
            setLoginError('All fields are required.');
            setIsLoading(false);
            return;
        }

        const token = btoa(`${username}:${appPassword}`);
        
        try {
            const userResponse = await fetch(`${siteUrl}/wp-json/wp/v2/users/me?context=edit`, {
                headers: { 'Authorization': `Basic ${token}` }
            });

            if (!userResponse.ok) {
                throw new Error('Invalid username or application password.');
            }

            const userData = await userResponse.json();
            
            // Save successful login info
            const authPayload = {
                username: userData.name,
                userId: userData.id,
                siteUrl: siteUrl,
                token: token
            };
            localStorage.setItem('providerAuth', JSON.stringify(authPayload));

            // Update state to trigger dashboard view and data fetch
            setUserId(userData.id);
            setCurrentUsername(userData.name);
            setIsLoggedIn(true);

        } catch (error) {
            setLoginError(error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('providerAuth');
        setIsLoggedIn(false);
        setUsername('');
        setAppPassword('');
        setCurrentUsername('');
        setUserId(null);
        setBookings([]);
        setEnquiries([]);
    };

    const fetchData = async () => {
        setIsLoading(true);
        const storedAuth = JSON.parse(localStorage.getItem('providerAuth'));
        if (!storedAuth) {
            setIsLoading(false);
            return;
        }

        try {
            const headers = { 'Authorization': `Basic ${storedAuth.token}` };
            const uid = storedAuth.userId;

            const [bookingsRes, enquiriesRes] = await Promise.all([
                fetch(`${storedAuth.siteUrl}/wp-json/wp/v2/booking?_fields=id,date,title,status,meta&meta_key=_provider_id&meta_value=${uid}`, { headers }),
                fetch(`${storedAuth.siteUrl}/wp-json/wp/v2/enquiry?_fields=id,date,title,status,meta&meta_key=_provider_id&meta_value=${uid}`, { headers })
            ]);

            if (!bookingsRes.ok || !enquiriesRes.ok) throw new Error('Failed to fetch data.');

            const bookingsData = await bookingsRes.json();
            const enquiriesData = await enquiriesRes.json();

            // Asynchronously enhance data with trip names
            const enhancedBookings = await addTripNamesToItems(bookingsData, storedAuth);
            const enhancedEnquiries = await addTripNamesToItems(enquiriesData, storedAuth, true);

            setBookings(enhancedBookings);
            setEnquiries(enhancedEnquiries);

        } catch (error) {
            console.error('Fetch Data Error:', error);
            alert('Could not fetch data. Please check your connection and credentials.');
            handleLogout();
        } finally {
            setIsLoading(false);
        }
    };
    
    const addTripNamesToItems = async (items, auth, isEnquiry = false) => {
        if (!items || items.length === 0) return [];
        const headers = { 'Authorization': `Basic ${auth.token}` };
    
        const enhancedItems = await Promise.all(items.map(async (item) => {
            let tripId = 0;
            const orderTrips = item.meta?.order_trips?.[0];
    
            if (isEnquiry) {
                tripId = item.meta?.wp_travel_engine_enquiry_trip_id?.[0];
            } else if (orderTrips) {
                try {
                    const cartKey = Object.keys(orderTrips)[0];
                    return { ...item, trip_name: orderTrips[cartKey]?.title || 'Unknown Trip' };
                } catch (e) { /* ignore */ }
            }
    
            if (tripId) {
                try {
                    const tripRes = await fetch(`${auth.siteUrl}/wp-json/wp/v2/trip/${tripId}?_fields=title`, { headers });
                    if (tripRes.ok) {
                        const tripData = await tripRes.json();
                        return { ...item, trip_name: tripData.title.rendered };
                    }
                } catch (e) { /* ignore */ }
            }
            return { ...item, trip_name: 'Unknown Trip' };
        }));
        return enhancedItems;
    };


    if (isLoading && !isLoggedIn) {
         return <div className="flex justify-center items-center h-screen"><Loader /></div>;
    }

    return (
        <div className="container mx-auto p-4 md:p-8 max-w-7xl">
            <header className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-gray-800">Provider Dashboard</h1>
                {isLoggedIn && (
                    <div>
                        <span className="text-sm mr-4">{`Logged in as: ${currentUsername}`}</span>
                        <button onClick={handleLogout} className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                            Logout
                        </button>
                    </div>
                )}
            </header>

            {!isLoggedIn ? (
                <div id="login-screen" className="bg-white p-8 rounded-2xl shadow-lg max-w-md mx-auto">
                    <h2 className="text-2xl font-bold mb-6 text-center">Login</h2>
                    {loginError && (
                        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-6" role="alert">
                            <strong className="font-bold">Error: </strong>
                            <span className="block sm:inline">{loginError}</span>
                        </div>
                    )}
                    <form onSubmit={handleLogin}>
                        <div className="mb-4">
                            <label htmlFor="site-url" className="block text-gray-700 text-sm font-bold mb-2">WordPress Site URL:</label>
                            <input type="text" id="site-url" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="e.g., https://world.hyrosy.com" className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div className="mb-4">
                            <label htmlFor="username" className="block text-gray-700 text-sm font-bold mb-2">Username:</label>
                            <input type="text" id="username" value={username} onChange={(e) => setUsername(e.target.value)} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div className="mb-6">
                            <label htmlFor="app-password" className="block text-gray-700 text-sm font-bold mb-2">Application Password:</label>
                            <input type="password" id="app-password" value={appPassword} onChange={(e) => setAppPassword(e.target.value)} className="shadow appearance-none border rounded-lg w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            <p className="text-xs text-gray-600 mt-2">Generate this in your user profile on the WordPress site.</p>
                        </div>
                        <div className="flex items-center justify-center">
                            <button type="submit" className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg w-full transition-colors" disabled={isLoading}>
                                {isLoading ? <div className="loader mx-auto" style={{ width: '20px', height: '20px', borderWidth: '2px' }}></div> : 'Login'}
                            </button>
                        </div>
                    </form>
                </div>
            ) : (
                <div id="dashboard-content">
                    {isLoading ? (
                         <div className="flex justify-center items-center h-64"><Loader /></div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div>
                                <h2 className="text-2xl font-bold mb-4">Your Bookings</h2>
                                {bookings.length === 0 ? (
                                    <div className="bg-white p-6 rounded-2xl shadow text-center"><p>No bookings found.</p></div>
                                ) : (
                                    <div className="space-y-4">
                                        {bookings.map(booking => (
                                            <div key={booking.id} className="bg-white p-6 rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h3 className="font-bold text-lg">{booking.title.rendered}</h3>
                                                        <p className="text-sm text-gray-600">Booking Date: <span>{new Date(booking.date).toLocaleDateString()}</span></p>
                                                    </div>
                                                    <span className={`text-xs font-semibold uppercase px-2 py-1 rounded-full ${booking.meta._wte_booking_status?.[0] === 'pending' ? 'bg-yellow-200 text-yellow-800' : 'bg-green-200 text-green-800'}`}>
                                                        {booking.meta._wte_booking_status?.[0]}
                                                    </span>
                                                </div>
                                                <div className="mt-4 border-t pt-4">
                                                    <p className="text-sm"><strong>Customer:</strong> <span>{(booking.meta.billing_info?.[0].fname || '') + ' ' + (booking.meta.billing_info?.[0].lname || '')}</span></p>
                                                    <p className="text-sm"><strong>Email:</strong> <span>{booking.meta.billing_info?.[0].email || 'N/A'}</span></p>
                                                    <p className="text-sm"><strong>Trip:</strong> <span>{booking.trip_name || 'Loading...'}</span></p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold mb-4">Your Enquiries</h2>
                                {enquiries.length === 0 ? (
                                    <div className="bg-white p-6 rounded-2xl shadow text-center"><p>No enquiries found.</p></div>
                                ) : (
                                     <div className="space-y-4">
                                        {enquiries.map(enquiry => (
                                            <div key={enquiry.id} className="bg-white p-6 rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
                                                <h3 className="font-bold text-lg">{enquiry.title.rendered}</h3>
                                                <p className="text-sm text-gray-600">Enquiry Date: <span>{new Date(enquiry.date).toLocaleDateString()}</span></p>
                                                <div className="mt-4 border-t pt-4">
                                                    <p className="text-sm"><strong>Trip:</strong> <span>{enquiry.trip_name || 'Loading...'}</span></p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
