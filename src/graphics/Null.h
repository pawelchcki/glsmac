#pragma once

#include "Graphics.h"

namespace graphics {

CLASS( Null, Graphics )

	// A declared logical viewport permits real UI layout without a renderer.
	// Other headless callers retain the existing zero-sized default.
	Null( const unsigned short width = 0, const unsigned short height = 0 )
		: m_width( width ), m_height( height ) {}

	void AddScene( scene::Scene* scene ) override {}
	void RemoveScene( scene::Scene* scene ) override {}
	const unsigned short GetWindowWidth() const override { return m_width; }
	const unsigned short GetWindowHeight() const override { return m_height; }
	const unsigned short GetViewportWidth() const override { return m_width; }
	const unsigned short GetViewportHeight() const override { return m_height; };

	void LoadTexture( types::texture::Texture* texture, const bool smoothen = true ) override {};
	void UnloadTexture( const types::texture::Texture* texture ) override {};
	void WithTexture( const types::texture::Texture* texture, const f_t& f ) override {};

	const bool IsFullscreen() const override { return false; }
	void SetFullscreen() override {}
	void SetWindowed() override {}

	const bool IsMouseLocked() const override { return false; }

	void ResizeWindow( const size_t width, const size_t height ) override {}

private:
	const unsigned short m_width;
	const unsigned short m_height;

};

}
