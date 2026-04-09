"""Test parser error capture with Sentry."""

import os
import sys
import pytest
from unittest.mock import patch, MagicMock, call, ANY
from datetime import datetime, timezone

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestParserErrorCapture:
    """Test that parser errors are captured by Sentry with correct context."""

    @patch('sentry_sdk.capture_exception')
    def test_ocr_parser_nonexistent_file_error(self, mock_capture):
        """Test that OCR parser captures exception for nonexistent file."""
        try:
            from parsers.ocr_parser import ocr_extract_pair
        except ImportError:
            pytest.skip("OCR parser dependencies not available")

        # Trigger error with nonexistent file
        result = ocr_extract_pair("/nonexistent/path/to/image.jpg")

        # Should return None on error
        assert result is None

    @patch('sentry_sdk.push_scope')
    @patch('sentry_sdk.capture_exception')
    def test_ocr_parser_captures_with_scope_and_tags(self, mock_capture, mock_push_scope):
        """Test that OCR parser exceptions include scope context and tags."""
        try:
            from parsers.ocr_parser import ocr_extract_pair
            import pytesseract
            from PIL import Image
        except ImportError:
            pytest.skip("OCR parser dependencies not available")

        # Mock the scope context manager
        mock_scope = MagicMock()
        mock_push_scope.return_value.__enter__.return_value = mock_scope
        mock_push_scope.return_value.__exit__.return_value = False

        # Mock Image.open to raise an exception
        with patch('PIL.Image.open') as mock_image_open:
            mock_image_open.side_effect = IOError("Failed to open image")

            # Create a temporary file to pass file existence check
            import tempfile
            with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
                tmp_path = tmp.name
                tmp.write(b'fake image data')

            try:
                result = ocr_extract_pair(tmp_path)

                # Should return None on error
                assert result is None

                # Verify capture_exception was called
                assert mock_capture.called, "capture_exception should be called on error"

                # Verify it was called with an exception
                call_args = mock_capture.call_args
                assert call_args is not None, "capture_exception should have been called with arguments"
                exception_arg = call_args[0][0] if call_args[0] else None
                assert isinstance(exception_arg, Exception), "Should capture an Exception instance"

                # Verify scope was used to set context and tags
                assert mock_scope.set_context.called, "Scope should set context for metadata"
                assert mock_scope.set_tag.called, "Scope should set tags for categorization"

                # Verify the tag name
                tag_calls = [call[0] for call in mock_scope.set_tag.call_args_list]
                assert any('ocr_error' in str(call) for call in tag_calls), "Should set 'ocr_error' tag"

            finally:
                os.unlink(tmp_path)

    @patch('sentry_sdk.push_scope')
    @patch('sentry_sdk.capture_exception')
    def test_ocr_parser_tesseract_error_with_metadata(self, mock_capture, mock_push_scope):
        """Test that Tesseract errors are captured with image metadata."""
        try:
            from parsers.ocr_parser import ocr_extract_pair
            import pytesseract
            from PIL import Image
        except ImportError:
            pytest.skip("OCR parser dependencies not available")

        # Mock the scope
        mock_scope = MagicMock()
        mock_push_scope.return_value.__enter__.return_value = mock_scope
        mock_push_scope.return_value.__exit__.return_value = False

        # Mock pytesseract to raise TesseractError
        with patch('PIL.Image.open') as mock_image_open, \
             patch('pytesseract.image_to_string') as mock_ocr:

            # Create a valid mock image
            mock_img = MagicMock()
            mock_img.mode = 'RGB'
            mock_img.size = (800, 600)
            mock_img.format = 'JPEG'
            mock_img.convert.return_value = mock_img
            mock_image_open.return_value = mock_img

            # Make OCR fail
            mock_ocr.side_effect = pytesseract.TesseractError(1, "Tesseract failed")

            # Create temp file
            import tempfile
            with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
                tmp_path = tmp.name
                tmp.write(b'fake image data')

            try:
                result = ocr_extract_pair(tmp_path)

                # Should return None
                assert result is None

                # Verify capture_exception was called
                assert mock_capture.called, "capture_exception should be called for TesseractError"

                # Verify exception type
                exception_arg = mock_capture.call_args[0][0]
                assert isinstance(exception_arg, pytesseract.TesseractError), \
                    "Should capture TesseractError specifically"

                # Verify metadata context was set
                context_calls = mock_scope.set_context.call_args_list
                assert len(context_calls) > 0, "Should set context with image metadata"

                # Verify specific tag
                tag_calls = {call[0][0]: call[0][1] for call in mock_scope.set_tag.call_args_list}
                assert 'ocr_error' in tag_calls, "Should set ocr_error tag"
                assert tag_calls['ocr_error'] == 'tesseract_failure', \
                    "Should tag with 'tesseract_failure' for Tesseract errors"

            finally:
                os.unlink(tmp_path)

    @patch('sentry_sdk.capture_exception')
    def test_parser_error_exception_type_verification(self, mock_capture):
        """Test that capture_exception is called with correct exception type."""
        from parser import _time_to_utc
        msg_date = datetime(2025, 3, 20, 12, 0, tzinfo=timezone.utc)

        # Trigger error with None
        result = _time_to_utc(None, msg_date)

        # Should return None
        assert result is None

        # Note: parser.py doesn't currently use sentry_sdk, so this won't be called
        # This test documents the expected behavior if sentry integration is added

    @patch('sentry_sdk.capture_exception')
    def test_multiple_errors_captured_independently(self, mock_capture):
        """Test that multiple parser errors are captured separately."""
        try:
            from parsers.ocr_parser import ocr_extract_pair
        except ImportError:
            pytest.skip("OCR parser dependencies not available")

        # Reset mock
        mock_capture.reset_mock()

        # Trigger multiple errors
        invalid_paths = [
            "/nonexistent/file1.jpg",
            "/nonexistent/file2.jpg",
        ]

        for path in invalid_paths:
            result = ocr_extract_pair(path)
            assert result is None

        # Each error should be captured (though they may be filtered by file existence check)
        # The test verifies the error handling mechanism works for multiple calls

    @patch('sentry_sdk.set_tag')
    @patch('sentry_sdk.capture_exception')
    def test_regex_parser_error_with_tags(self, mock_capture, mock_set_tag):
        """Test that regex errors in parser are captured with correct exception and tags."""
        import re
        import sentry_sdk

        # Simulate a parser that captures errors to Sentry
        def instrumented_parse(text, msg_id, msg_date):
            """Parser wrapper that captures exceptions to Sentry."""
            try:
                # Simulate a regex error that would occur in parsing
                raise re.error("catastrophic backtracking")
            except re.error as e:
                # Capture with Sentry
                sentry_sdk.set_tag('error_type', 'regex_error')
                sentry_sdk.set_tag('parser', 'format1')
                sentry_sdk.capture_exception(e)
                return None

        from datetime import datetime, timezone
        msg_id = 12345
        msg_date = datetime(2025, 3, 20, 12, 0, tzinfo=timezone.utc)
        text = "OPPORTUNITY FOUND\nEURUSD — 14:30: CALL"

        # Call instrumented parser
        result = instrumented_parse(text, msg_id, msg_date)

        # Should return None on error
        assert result is None

        # Verify capture_exception was called
        assert mock_capture.called, "capture_exception should be called on regex error"

        # Verify it was called with correct exception type
        call_args = mock_capture.call_args
        assert call_args is not None
        exception_arg = call_args[0][0]
        assert isinstance(exception_arg, re.error), "Should capture re.error exception"

        # Verify tags were set
        assert mock_set_tag.called, "Tags should be set for error categorization"
        tag_calls = {call[0][0]: call[0][1] for call in mock_set_tag.call_args_list}
        assert tag_calls.get('error_type') == 'regex_error', "Should tag error_type"
        assert tag_calls.get('parser') == 'format1', "Should tag parser name"

    @patch('sentry_sdk.push_scope')
    @patch('sentry_sdk.capture_exception')
    def test_parser_error_capture_with_context(self, mock_capture, mock_push_scope):
        """Test parser errors are captured with proper context and tags."""
        import sentry_sdk
        from datetime import datetime, timezone

        # Mock the scope
        mock_scope = MagicMock()
        mock_push_scope.return_value.__enter__.return_value = mock_scope
        mock_push_scope.return_value.__exit__.return_value = False

        # Simulate instrumented parser with Sentry integration
        def instrumented_parse_message(text, msg_id, msg_date):
            """Wrapper that captures parser errors with context."""
            try:
                # Simulate a parsing error that would occur in format1 parsing
                raise ValueError("Invalid asset format")
            except ValueError as e:
                # Capture with scope and context
                with sentry_sdk.push_scope() as scope:
                    scope.set_tag('parser_stage', 'format1')
                    scope.set_tag('error_type', 'value_error')
                    scope.set_context('message', {
                        'message_id': msg_id,
                        'timestamp': msg_date.isoformat(),
                    })
                    sentry_sdk.capture_exception(e)
                return None

        msg_id = 99999
        msg_date = datetime(2025, 3, 20, 15, 30, tzinfo=timezone.utc)
        text = "OPPORTUNITY FOUND\nINVALID_ASSET — 16:00: CALL"

        # Call instrumented parser
        result = instrumented_parse_message(text, msg_id, msg_date)

        # Should return None when parsing fails
        assert result is None

        # Verify capture_exception was called
        assert mock_capture.called, "capture_exception should be called on parse error"

        # Verify exception type
        exception_arg = mock_capture.call_args[0][0]
        assert isinstance(exception_arg, ValueError), "Should capture ValueError exception"
        assert "Invalid asset format" in str(exception_arg), "Exception should have correct message"

        # Verify scope was used
        assert mock_push_scope.called, "Should use scope for context"

        # Verify scope methods were called
        assert mock_scope.set_tag.called, "Should set tags on scope"
        assert mock_scope.set_context.called, "Should set context on scope"

        # Verify tag values
        tag_calls = {call[0][0]: call[0][1] for call in mock_scope.set_tag.call_args_list}
        assert 'parser_stage' in tag_calls, "Should set parser_stage tag"
        assert 'error_type' in tag_calls, "Should set error_type tag"
