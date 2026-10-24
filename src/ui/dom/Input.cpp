#include "Input.h"
#include "ui/PresentationTrace.h"

#include "Text.h"
#include "ui/geometry/Geometry.h"
#include "engine/Engine.h"
#include "input/Input.h"
#include "input/Event.h"
#include "ui/UI.h"

namespace ui {
namespace dom {

Input::Input( DOM_ARGS )
	: Panel( DOM_ARGS_PASS, "Input", false )
	, Focusable() {

	TraceConstructorRole( "text-editor" );
	m_text = new Text( GSE_CALL, ui, this, {} );
	m_text->GetGeometry()->SetAlign( geometry::Geometry::ALIGN_LEFT_CENTER );
	m_text->GetGeometry()->SetLeft( 4 ); // TODO: configurable?
	m_text->GetGeometry()->SetRight( 4 ); // TODO: configurable?
	Embed( m_text );
	TracePart( m_text, "editor-display" );

	m_geometry->SetOverflowMode( geometry::Geometry::OM_HIDDEN );

	m_is_blink_cursor_visible = false;
	UpdateText();

	Property(
		GSE_CALL, "max_length", gse::VT_INT, VALUE( gse::value::Int,, 0 ), PF_NONE,
		[ this ]( GSE_CALLABLE, gse::Value* const v ) {
			const auto length = ( (gse::value::Int*)v )->value;
			if ( length < 0 ) { GSE_ERROR( gse::EC.INVALID_ASSIGNMENT, "Input max_length must not be negative" ); }
			if ( m_state.SetMaxLength( length ) ) { ValueChanged( GSE_CALL ); }
			else { TraceNativeState(); }
			return nullptr;
		}
	);

	Property(
		GSE_CALL, "value", gse::VT_STRING, VALUE( gse::value::String, , "" ), PF_NONE,
		[ this ]( GSE_CALLABLE, gse::Value* const v ) {
			SetValue( GSE_CALL, ( (gse::value::String*)v )->value );
			return nullptr;
		}
	);

	ForwardProperty( GSE_CALL, "color", m_text );
	ForwardProperty( GSE_CALL, "font", m_text );

	Events(
		{
			input::EV_CHANGE,
			input::EV_INPUT,
		}
	);

	Iterable(
		[ this ]() {
			while ( m_blinker.HasTicked() ) {
				m_is_blink_cursor_visible = !m_is_blink_cursor_visible;
				UpdateText();
			}
		}
	);

	GeometryHandler(
		GH_ON_AREA_UPDATE, [ this ]() {
			FixAlign();
		}
	);
	TraceNativeState();
}

void Input::TraceSnapshot( std::unordered_set< dom_id_t >& visited ) const {
	if ( !presentation::Get().Enabled() || visited.find( m_dom_id ) != visited.end() ) { return; }
	Panel::TraceSnapshot( visited );
	TraceNativeState();
}

void Input::OnFocus() {
	if ( !m_is_focused ) {
		m_is_focused = true;
		m_blinker.SetInterval( 250 ); // TODO: config?
		if ( !m_is_blink_cursor_visible ) {
			m_is_blink_cursor_visible = true;
			UpdateText();
		}
	}
}
void Input::OnDefocus() {
	if ( m_is_focused ) {
		m_is_focused = false;
		m_blinker.Stop();
		if ( m_is_blink_cursor_visible ) {
			m_is_blink_cursor_visible = false;
			UpdateText();
		}
	}
}

void Input::Show() {
	Panel::Show();
	if ( m_ui ) {
		m_ui->AddFocusable( this );
	}
}

void Input::Hide() {
	if ( m_ui ) {
		m_ui->RemoveFocusable( this );
	}
	Panel::Hide();
}

const bool Input::ProcessEventImpl( GSE_CALLABLE, const input::Event& event ) {
	switch ( event.type ) {
		case input::EV_KEY_DOWN: {
			if ( m_is_focused ) {
				std::string clipboard;
				if ( event.data.key.code == input::K_INSERT && ( event.data.key.modifiers & input::KM_SHIFT ) ) {
					clipboard = g_engine->GetInput()->GetClipboardText();
				}
				const auto result = m_state.KeyDown( event.data.key.code, event.data.key.is_printable, event.data.key.key, event.data.key.modifiers, clipboard );
				if ( result.changed ) { ValueChanged( GSE_CALL ); }
				if ( result.submitted ) {
					input::Event e;
					e.SetType( input::EV_INPUT );
					e.data.value.change_select.text = new std::string( m_state.GetValue() );
					ProcessEvent( GSE_CALL, e );
					delete e.data.value.change_select.text;
				}
				if ( result.handled ) { return true; }
			}
			break;
		}
		case input::EV_MOUSE_DOWN: {
			if ( event.data.mouse.button == input::MB_LEFT && !m_is_focused ) {
				if ( m_ui ) {
					m_ui->Focus( this );
				}
				return true;
			}
			break;
		}
		default: {
		}
	}
	return Panel::ProcessEventImpl( GSE_CALL, event );
}

void Input::WrapEvent( GSE_CALLABLE, const input::Event& e, gse::value::object_properties_t& obj ) const {
	switch ( e.type ) {
		case input::EV_CHANGE:
		case input::EV_INPUT: {
			ASSERT( e.data.value.change_select.text, "change text not set" );
			obj.insert(
				{
					"value",
					VALUE( gse::value::String, , *e.data.value.change_select.text )
				}
			);
			break;
		}
		default: {
			Panel::WrapEvent( GSE_CALL, e, obj );
		}
	}
}

void Input::TraceNativeState() const {
	if ( !presentation::Get().Enabled() ) { return; }
	TraceField( "value", presentation::Quote( m_state.GetValue() ) );
	TraceField( "max_length", std::to_string( m_state.GetMaxLength() ) );
}

void Input::SetValue( GSE_CALLABLE, const std::string& value ) {
	if ( m_state.SetValue( value ) ) { ValueChanged( GSE_CALL ); }
	else { TraceNativeState(); }
}

void Input::ValueChanged( GSE_CALLABLE ) {
	UpdateText();
	UpdateProperty( "value", VALUE( gse::value::String, , m_state.GetValue() ) );
	TraceNativeState();
	input::Event e;
	e.SetType( input::EV_CHANGE );
	e.data.value.change_select.text = new std::string( m_state.GetValue() );
	ProcessEvent( GSE_CALL, e );
	delete e.data.value.change_select.text;
	FixAlign();
}

void Input::FixAlign() {
	auto* g = m_text->GetGeometry();
	if ( g->m_area.width < m_geometry->m_area.width ) {
		g->SetAlign( geometry::Geometry::ALIGN_LEFT_CENTER );
	}
	else {
		g->SetAlign( geometry::Geometry::ALIGN_RIGHT_CENTER );
	}
}

void Input::UpdateText() {
	m_text->SetText(
		m_state.GetValue() + ( m_is_blink_cursor_visible
			? "_"
			: " "
		)
	);
}

}
}
