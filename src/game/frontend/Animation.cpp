#include "Animation.h"

#include "engine/Engine.h"
#include "AnimationDef.h"
#include "scene/actor/Sound.h"
#include "audio/Audio.h"
#include "game/frontend/sprite/InstancedSprite.h"
#include "scene/actor/Instanced.h"
#include "ui/PresentationTrace.h"

namespace game {
namespace frontend {

Animation::Animation( const size_t animation_id, AnimationDef* def, const types::Vec3& render_coords )
	: m_presentation_id( ui::presentation::NextPlayback() )
	, m_def( def )
	, m_render_coords( render_coords )
	, m_frames( def->GetSprites() ) {
	ASSERT( !m_def->GetSprites().empty(), "animation has no sprites defined" );
	TracePlayback( "", "{}", true );
	m_sound = new scene::actor::Sound( "Animation_Sound_" + std::to_string( animation_id ), def->GetSound() );
	g_engine->GetAudio()->AddActor( m_sound );
	m_timer.SetInterval( m_def->GetDurationMs() / m_frames.size() );
	ShowNextFrame();
	m_sound->Play();
}

Animation::~Animation() {
	const bool cancelled = m_timer.IsRunning();
	m_timer.Stop();
	if ( m_instance_id ) {
		// clear animation
		m_frames.at( m_frame_index - 1 )->actor->RemoveInstance( m_instance_id );
		TraceFrame( false );
	}
	if ( cancelled ) {
		TracePlayback( "media.stop", "{\"reason\":\"cancelled\",\"evidence\":\"scene-instance\"}" );
	}
	TracePlayback( "media.destroy", "{\"evidence\":\"scene-instance\"}" );
	m_sound->Stop();
	g_engine->GetAudio()->RemoveAndDeleteActor( m_sound );
}

const bool Animation::IsFinished() const {
	return !m_timer.IsRunning();
}

void Animation::Iterate() {
	while ( m_timer.HasTicked() ) {
		ShowNextFrame();
	}
}

void Animation::ShowNextFrame() {
	if ( m_frame_index ) {
		// clear previous frame
		m_frames.at( m_frame_index - 1 )->actor->RemoveInstance( m_instance_id );
		TraceFrame( false );
	}
	if ( m_frame_index++ < m_frames.size() ) {
		// show next frame
		m_instance_id = m_frames.at( m_frame_index - 1 )->actor->AddInstance( m_render_coords );
		if ( m_frame_index == 1 ) {
			TracePlayback( "media.start", "{\"evidence\":\"scene-instance\"}" );
		}
		TraceFrame( true );
	}
	else {
		// no frames left
		m_instance_id = 0;
		m_timer.Stop();
		TracePlayback( "media.end", "{\"reason\":\"completed\",\"evidence\":\"scene-instance\"}" );
	}
}

void Animation::TracePlayback( const char* kind, const char* data, const bool construction ) {
	if ( !ui::presentation::CanRecordControl() ) { return; }
	// A surviving animation is registered lazily after Start, without fabricating
	// its earlier start or frames. Scene submission does not prove pixel output.
	ui::presentation::Get().RecordPlayback( m_presentation_id, m_presentation_epoch, m_def->GetId(), kind, data, "animation",
		"\"duration_ms\":" + std::to_string( m_def->GetDurationMs() ) +
		",\"frame_count\":" + std::to_string( m_frames.size() ) +
		",\"x\":" + ui::presentation::Float( m_render_coords.x ) +
		",\"y\":" + ui::presentation::Float( m_render_coords.y ) +
		",\"z\":" + ui::presentation::Float( m_render_coords.z ) +
		",\"evidence\":\"native-registration\",\"history\":" + ui::presentation::Quote( construction ? "from-construction" : "partial" ) );
}

void Animation::TraceFrame( const bool present ) {
	if ( !ui::presentation::CanRecordControl() ) { return; }
	const auto data = "{\"frame_index\":" + std::to_string( m_frame_index - 1 ) +
		",\"scene_instance_id\":" + std::to_string( m_instance_id ) +
		",\"present\":" + std::string( present ? "true" : "false" ) + ",\"evidence\":\"scene-instance\"}";
	TracePlayback( "media.frame", data.c_str() );
}

}
}
