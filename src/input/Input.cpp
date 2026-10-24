#include "Input.h"
#include "PresentationTrace.h"

namespace input {

void Input::AddHandler( const void* const owner, const input_handler_t& handler ) {
	ASSERT( m_input_handlers.find( owner ) == m_input_handlers.end(), "handler already set" );
	m_input_handlers.insert(
		{
			owner,
			handler
		}
	);
}

void Input::RemoveHandler( const void* const owner ) {
	ASSERT( m_input_handlers.find( owner ) != m_input_handlers.end(), "handler not set" );
	m_input_handlers.erase( owner );
}

const bool Input::ProcessEvent( const Event& event ) {
	const bool tracing = ui::presentation::Get().LedgerEnabled();
	ui::presentation::InputDispatchScope scope( tracing ? event.presentation_ingress : 0 );
	if ( tracing ) {
		ui::presentation::Event( "input.dispatch", "input", PresentationDispatchData( event, ui::presentation::Get().Action() ) );
	}
	const auto finish = [ & ]( const bool handled ) {
		if ( tracing ) { ui::presentation::Event( "input.dispatch", "input", "{\"phase\":\"end\",\"ingress\":" + std::to_string( event.presentation_ingress ) + ",\"handled\":" + ( handled ? "true" : "false" ) + "}" ); }
		return handled;
	};
	for ( const auto& it : m_input_handlers ) {
		if ( it.second( event ) ) {
			return finish( true );
		}
	}
	return finish( false );
}

}
