#pragma once

#include <string>
#include "input/Types.h"

namespace ui::dom {

// The native edit buffer has no scene, focus or event-dispatch dependencies.
// Input owns those boundaries and publishes changes made by this state.
class InputState {
public:

	struct KeyResult {
		bool handled = false;
		bool changed = false;
		bool submitted = false;
	};

	const std::string& GetValue() const;
	bool SetValue( const std::string& value );
	bool SetMaxLength( size_t max_length );
	KeyResult KeyDown( input::key_code_t code, bool is_printable, char key, input::key_modifier_t modifiers, const std::string& clipboard = "" );

private:
	std::string m_value;
	size_t m_max_length = 0; // zero keeps ordinary inputs unlimited
};

}
