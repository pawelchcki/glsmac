#include "InputState.h"

#include "util/String.h"

namespace ui::dom {

const std::string& InputState::GetValue() const {
	return m_value;
}

bool InputState::SetValue( const std::string& value ) {
	const auto next = m_max_length ? value.substr( 0, m_max_length ) : value;
	if ( next == m_value ) { return false; }
	m_value = next;
	return true;
}

bool InputState::SetMaxLength( const size_t max_length ) {
	m_max_length = max_length;
	return SetValue( m_value );
}

InputState::KeyResult InputState::KeyDown( const input::key_code_t code, const bool is_printable, const char key, const input::key_modifier_t modifiers, const std::string& clipboard ) {
	switch ( code ) {
		case input::K_BACKSPACE: {
			const auto changed = !m_value.empty() && SetValue( m_value.substr( 0, m_value.size() - 1 ) );
			return { true, changed, false };
		}
		case input::K_ENTER: {
			return { true, false, true };
		}
		case input::K_INSERT: {
			if ( modifiers & input::KM_SHIFT ) {
				return { true, SetValue( m_value + util::String::FilterPrintable( clipboard ) ), false };
			}
			[[fallthrough]];
		}
		default: {
			if ( is_printable ) { return { true, SetValue( m_value + std::string( 1, key ) ), false }; }
		}
	}
	return {};
}

}
