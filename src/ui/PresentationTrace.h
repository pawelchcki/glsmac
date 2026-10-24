#pragma once

// Opt-in, diagnostic-only presentation observer. Never call from real-time audio
// callbacks: this bounded producer may allocate and lock. Drain from GSE/main.
#include <atomic>
#include <cstdint>
#include <mutex>
#include <string>
#include <vector>
#include <deque>
#include <cmath>
#include <iomanip>
#include <limits>
#include <locale>
#include <sstream>

namespace ui::presentation {

inline std::string Quote( const std::string& value ) {
	std::string result = "\"";
	const char* hex = "0123456789abcdef";
	for ( const unsigned char c : value ) {
		if ( c == '"' || c == '\\' ) { result += '\\'; result += c; }
		else if ( c < 32 ) { result += "\\u00"; result += hex[c >> 4]; result += hex[c & 15]; }
		else { result += c; }
	}
	return result + '"';
}

class Observer {
public:
	static constexpr size_t MAX_EVENTS = 65536;
	static constexpr size_t MAX_BYTES = 16 * 1024 * 1024;
	static constexpr size_t MAX_PAYLOAD_BYTES = 16384;

	bool Enabled() const { return m_enabled.load( std::memory_order_relaxed ); }
	void Start() {
		std::lock_guard< std::mutex > lock( m_mutex );
		m_events.clear(); m_bytes = 0; m_dropped = 0; m_seq = 0; m_seal_requested.store( false );
		m_commands.clear(); m_applying_commands = false; m_nonce = 0; m_action = 0; m_checkpoint = 0; m_action_open = false; m_ledger = false; m_ingress = 0;
		++m_epoch;
		m_enabled.store( true, std::memory_order_relaxed );
	}
	void Stop() { m_enabled.store( false, std::memory_order_relaxed ); }
	void RequestSeal() { m_seal_requested.store( true ); }
	bool SealRequested() const { return m_seal_requested.load(); }
	void Record( const std::string& kind, const std::string& target, const std::string& data = "{}" ) {
		if ( !Enabled() ) { return; }
		std::lock_guard< std::mutex > lock( m_mutex );
		if ( !Enabled() ) { return; }
		RecordLocked( kind, target, data );
	}
	// A surviving actor is lazily registered on its first observation in an
	// epoch. Birth and control share the lock; this is not an output baseline.
	void RecordPlayback( const uint64_t id, uint64_t& epoch, const std::string& source, const std::string& kind, const std::string& data, const std::string& media_type = "audio", const std::string& creation_fields = "" ) {
		if ( !Enabled() ) { return; }
		std::lock_guard< std::mutex > lock( m_mutex );
		if ( !Enabled() ) { return; }
		const auto target = "m" + std::to_string( id );
		if ( epoch != m_epoch ) {
			epoch = m_epoch;
			RecordLocked( "media.create", target, "{\"type\":" + Quote( media_type ) + ",\"source\":" + Quote( source ) + ( creation_fields.empty() ? "" : "," + creation_fields ) + "}" );
		}
		if ( !kind.empty() ) { RecordLocked( kind, target, data ); }
	}
	// Numeric command payloads cross the browser/application thread boundary.
	// Only InputBarrier applies them, after SDL's pending coalesced dispatch.
	static constexpr size_t MAX_COMMANDS = 64;
	bool LedgerEnabled() const { return Enabled() && m_ledger.load(); }
	void StartInputs() {
		if ( !Enabled() ) { return; }
		if ( m_ledger ) { Record( "trace.error", "trace", "{\"reason\":\"duplicate input epoch\"}" ); return; }
		m_action = 1; m_action_open = true; m_ledger = true;
		Record( "trace.protocol", "trace", "{\"version\":1,\"physical_os_complete\":false}" );
		Record( "trace.action", "trace", "{\"op\":1,\"action\":1,\"checkpoint\":0,\"nonce\":0}" );
	}
	int Command( const uint32_t op, const uint32_t action, const uint32_t checkpoint, const uint32_t nonce ) {
		std::lock_guard< std::mutex > lock( m_mutex );
		if ( !Enabled() || !m_ledger || m_seal_requested.load() ) { return -1; }
		if ( !nonce || nonce != m_nonce + 1 || op < 1 || op > 3 || !action || action > 256 || checkpoint > 1024 ) { ++m_dropped; return -2; }
		if ( m_commands.size() >= MAX_COMMANDS ) { ++m_dropped; return -3; }
		m_nonce = nonce;
		m_commands.push_back( { op, action, checkpoint, nonce } );
		return 1;
	}
	void InputBarrier() {
		if ( !LedgerEnabled() ) { return; }
		std::deque< CommandData > commands;
		{ std::lock_guard< std::mutex > lock( m_mutex ); commands.swap( m_commands ); m_applying_commands = !commands.empty(); }
		for ( const auto& c : commands ) {
			const bool valid = c.op == 1 ? ( !m_action_open && c.action == m_action + 1 && !c.checkpoint ) :
				c.op == 2 ? ( m_action_open && c.action == m_action && !c.checkpoint ) :
				( !m_action_open && c.action == m_action && c.checkpoint == m_checkpoint + 1 );
			if ( !valid ) {
				Record( "trace.error", "trace", "{\"nonce\":" + std::to_string( c.nonce ) + ",\"reason\":\"invalid action/checkpoint order\"}" );
				continue;
			}
			if ( c.op == 1 ) { m_action = c.action; m_action_open = true; }
			else if ( c.op == 2 ) { m_action_open = false; }
			else { m_checkpoint = c.checkpoint; }
			Record( c.op == 3 ? "trace.checkpoint" : "trace.action", "trace",
				"{\"op\":" + std::to_string( c.op ) + ",\"action\":" + std::to_string( c.action ) +
				",\"checkpoint\":" + std::to_string( c.checkpoint ) + ",\"nonce\":" + std::to_string( c.nonce ) + "}" );
		}
		{ std::lock_guard< std::mutex > lock( m_mutex ); m_applying_commands = false; }
	}
	uint64_t NextIngress() { return ++m_ingress; } // application thread only
	uint32_t Action() const { return m_action.load(); }

	std::string Drain( const bool seal = false ) {
		std::lock_guard< std::mutex > lock( m_mutex );
		if ( seal && ( !m_commands.empty() || m_applying_commands ) ) { ++m_dropped; }
		std::string result = "{\"enabled\":" + std::string( Enabled() ? "true" : "false" ) + ",\"dropped\":" + std::to_string( m_dropped ) + ",\"events\":[";
		bool first = true;
		for ( const auto& event : m_events ) { if ( !first ) { result += ','; } first = false; result += event; }
		m_events.clear(); m_bytes = 0;
		if ( seal ) {
			m_enabled.store( false, std::memory_order_relaxed );
		}
		return result + "]}";
	}
private:
	void RecordLocked( const std::string& kind, const std::string& target, const std::string& data ) {
		const auto seq = ++m_seq;
		if ( m_events.size() >= MAX_EVENTS || data.size() > MAX_PAYLOAD_BYTES || m_bytes + data.size() + kind.size() + target.size() + 100 > MAX_BYTES ) {
			++m_dropped;
			return;
		}
		auto record = "{\"seq\":" + std::to_string( seq ) + ",\"kind\":" + Quote( kind ) + ",\"target\":" + Quote( target ) + ",\"data\":" + data + "}";
		m_bytes += record.size();
		m_events.push_back( std::move( record ) );
	}
	uint64_t m_epoch = 0;
	struct CommandData { uint32_t op, action, checkpoint, nonce; };
	std::deque< CommandData > m_commands;
	uint32_t m_nonce = 0, m_checkpoint = 0;
	std::atomic< uint32_t > m_action{ 0 };
	std::atomic< bool > m_ledger{ false };
	bool m_action_open = false, m_applying_commands = false;
	uint64_t m_ingress = 0;
	std::atomic< bool > m_enabled{ false };
	std::atomic< bool > m_seal_requested{ false };
	std::mutex m_mutex;
	std::vector< std::string > m_events;
	size_t m_bytes = 0;
	uint64_t m_seq = 0, m_dropped = 0;
};

// Rewind/Play can be reached by looping playback inside GetNextBuffer. The
// callback guard prevents any diagnostic allocation/locking on that path.
inline thread_local bool in_audio_callback = false;
class AudioCallbackScope {
public:
	AudioCallbackScope() : previous( in_audio_callback ) { in_audio_callback = true; }
	~AudioCallbackScope() { in_audio_callback = previous; }
private:
	bool previous;
};

// Native hover transitions may also arise from layout/timers without ingress.
inline thread_local uint64_t dispatch_ingress = 0;
class InputDispatchScope {
public:
	explicit InputDispatchScope( uint64_t ingress ) : previous( dispatch_ingress ) { dispatch_ingress = ingress; }
	~InputDispatchScope() { dispatch_ingress = previous; }
private:
	uint64_t previous;
};

inline Observer& Get() { static Observer observer; return observer; }
// JSON numbers round-trip the actual native float, independent of locale.
inline std::string Float( const float value ) {
	if ( !std::isfinite( value ) ) {
		Get().Record( "trace.error", "trace", "{\"reason\":\"non-finite native float\"}" );
		return "null";
	}
	std::ostringstream stream;
	stream.imbue( std::locale::classic() );
	stream << std::setprecision( std::numeric_limits< float >::max_digits10 ) << value;
	auto result = stream.str();
	if ( result.find_first_of( ".eE" ) == std::string::npos ) { result += ".0"; }
	return result;
}
inline bool CanRecordControl() { return !in_audio_callback && Get().Enabled(); }
inline std::string Node( const uint64_t id ) { return "n" + std::to_string( id ); }
inline std::string Playback( const uint64_t id ) { return "m" + std::to_string( id ); }
inline uint64_t NextPlayback() { static std::atomic< uint64_t > id{ 0 }; return ++id; }
inline void Event( const std::string& kind, const std::string& target, const std::string& data = "{}" ) { Get().Record( kind, target, data ); }

}

// Arguments are evaluated only when tracing is enabled.
#define PRESENTATION_EVENT( ... ) do { if ( ::ui::presentation::Get().Enabled() ) { ::ui::presentation::Event( __VA_ARGS__ ); } } while ( false )
