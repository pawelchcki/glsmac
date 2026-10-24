#pragma once

#include "ui/PresentationTrace.h"
#include "Event.h"

namespace input {

// Event's data union is reused by SDL. Only read fields defined by this type;
// unused bytes can still hold data from a previous keyboard/mouse event.
inline std::string PresentationDispatchData( const Event& event, const uint32_t action ) {
	std::string data = "{\"phase\":\"begin\",\"ingress\":" + std::to_string( event.presentation_ingress ) +
		",\"type\":" + ui::presentation::Quote( event.GetTypeStr() ) + ",\"action\":" + std::to_string( action );
	switch ( event.type ) {
		case EV_MOUSE_MOVE:
		case EV_MOUSE_OVER:
		case EV_MOUSE_OUT:
		case EV_MOUSE_DOWN:
		case EV_MOUSE_UP:
			data += ",\"x\":" + std::to_string( event.data.mouse.x ) + ",\"y\":" + std::to_string( event.data.mouse.y );
			if ( event.type == EV_MOUSE_DOWN || event.type == EV_MOUSE_UP ) {
				data += ",\"button\":" + std::to_string( event.data.mouse.button );
			}
			break;
		case EV_MOUSE_SCROLL:
			data += ",\"x\":" + std::to_string( event.data.mouse.x ) + ",\"y\":" + std::to_string( event.data.mouse.y ) + ",\"scroll_y\":" + std::to_string( event.data.mouse.scroll_y );
			break;
		case EV_KEY_DOWN:
		case EV_KEY_UP:
			data += ",\"code\":" + ui::presentation::Quote( event.GetKeyCodeStr() ) + ",\"key\":" + std::to_string( event.data.key.key ) +
				",\"modifiers\":" + std::to_string( event.data.key.modifiers ) + ",\"printable\":" + ( event.data.key.is_printable ? "true" : "false" );
			break;
		default:
			break;
	}
	return data + "}";
}

}
